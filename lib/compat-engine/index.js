import { randomBytes, randomUUID } from "node:crypto";
import { availableParallelism, tmpdir } from "node:os";
import * as vm from "node:vm";
import z from "@deepseek-ai/schemastery";
import { WorkflowError, WorkflowRunId } from "@deepseek-ai/dsh-workflow";
import { snapshotJsonValue } from "@deepseek-ai/dsh-util-values";
import { Buffer as Buffer$1 } from "node:buffer";
import { constants } from "node:fs";
import { chmod, link, lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { assertObjectJsonSchema } from "@deepseek-ai/dsh-tools";
//#region vendor/workflow-engine/compat-seam.ts
/** Local extensions deliberately absent from the official 0.1.2-rc.1 seam. */
const WorkflowError$1 = WorkflowError;
//#endregion
//#region vendor/workflow-engine/realm.ts
/**
* Materializes values leaving the script vm into plain JSON before they cross the worker
* boundary, and renders thrown script values without rejecting the run. The walk rejects
* values that JSON cannot preserve but trusts model-written workflow scripts: getters and proxy traps may
* run, and the vm is not a security boundary. The worker provides host-loop isolation and
* forced termination, not hostile-value containment. See
* .agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md for the isolation rationale.
* @module @deepseek-ai/dsh-workflow-worker-thread/realm
*/
/** Thrown by {@link materializeFromRealm}; the caller wraps it into the right `WorkflowError` code. */
var MaterializeError = class extends Error {
	constructor(path, reason) {
		super(`${path}: ${reason}`);
		this.path = path;
		this.reason = reason;
		this.name = "MaterializeError";
	}
};
/**
* Render a thrown value to failure text without ever throwing: prefer the
* `stack` (host or realm — a realm error's `stack` is a plain string read),
* fall back to `message`, then `String()`. Reading those properties MAY run
* script code (a getter, `toString`) — accepted under the module's trust
* premise; if that code itself throws, a fixed label is returned instead.
* @param error - any value thrown in the host or worker realm.
* @returns human-readable text for the failure report; prefers the stack.
*/
function renderThrown(error) {
	try {
		const stack = error?.stack;
		if (typeof stack === "string" && stack.length > 0) return stack;
		const message = error?.message;
		if (typeof message === "string" && message.length > 0) return message;
		return String(error);
	} catch {
		return "[unrenderable thrown value]";
	}
}
/**
* Whether an object's prototype chain represents a plain data object: `null`, or a prototype
* whose own prototype is `null` (the realm's `Object.prototype` — which we
* cannot compare by identity across realms). A `Date`/`Map`/class instance
* has a longer chain and is rejected.
*/
function hasPlainPrototype(value) {
	const proto = Object.getPrototypeOf(value);
	if (proto === null) return true;
	return Object.getPrototypeOf(proto) === null;
}
/**
* Copy `value` (typically from the vm realm) into plain host JSON data. Root `undefined` is
* returned unchanged; nested `undefined` and values JSON cannot represent losslessly fail
* with the offending path. Property accessors run normally, and a throwing read is wrapped
* with its rendered failure.
*
* @param value - the realm value to materialize.
* @param root - the path label for the root value (error messages).
* @returns the host-realm copy (plain objects/arrays/scalars only).
* @throws {@link MaterializeError} for unsupported values, cycles, sparse arrays, exotic
*   prototypes, or property reads that throw.
*/
function materializeFromRealm(value, root = "value") {
	if (value === void 0) return void 0;
	try {
		return materialize(value, root, /* @__PURE__ */ new Set());
	} catch (error) {
		if (error instanceof MaterializeError) throw error;
		throw new MaterializeError(root, `reading the value threw: ${renderThrown(error)}`);
	}
}
function materialize(value, path, seen) {
	switch (typeof value) {
		case "boolean":
		case "string": return value;
		case "number":
			if (!Number.isFinite(value)) throw new MaterializeError(path, "non-finite numbers are not JSON data");
			return value;
		case "bigint": throw new MaterializeError(path, "bigints are not JSON data");
		case "function": throw new MaterializeError(path, "functions are not plain JSON data");
		case "symbol": throw new MaterializeError(path, "symbols are not plain JSON data");
		case "undefined": throw new MaterializeError(path, "undefined is not JSON data");
	}
	if (value === null) return null;
	const objectValue = value;
	if (seen.has(objectValue)) throw new MaterializeError(path, "circular references are not JSON data");
	seen.add(objectValue);
	try {
		if (Array.isArray(objectValue)) return materializeArray(objectValue, path, seen);
		return materializeObject(objectValue, path, seen);
	} finally {
		seen.delete(objectValue);
	}
}
function materializeArray(value, path, seen) {
	const out = [];
	for (let index = 0; index < value.length; index++) {
		if (!(index in value)) throw new MaterializeError(`${path}[${index}]`, "sparse arrays are not JSON data");
		out.push(materialize(value[index], `${path}[${index}]`, seen));
	}
	for (const key of Object.keys(value)) {
		const index = Number(key);
		if (!Number.isInteger(index) || index < 0 || index >= value.length) throw new MaterializeError(`${path}.${key}`, "arrays with non-index properties are not JSON data");
	}
	if (Object.getOwnPropertySymbols(value).length > 0) throw new MaterializeError(path, "symbol-keyed properties are not plain JSON data");
	return out;
}
function materializeObject(value, path, seen) {
	if (!hasPlainPrototype(value)) throw new MaterializeError(path, "only plain objects and arrays are JSON data (exotic prototype)");
	if (Object.getOwnPropertySymbols(value).length > 0) throw new MaterializeError(path, "symbol-keyed properties are not plain JSON data");
	const out = {};
	for (const key of Object.keys(value)) Object.defineProperty(out, key, {
		value: materialize(value[key], `${path}.${key}`, seen),
		enumerable: true,
		writable: true,
		configurable: true
	});
	return out;
}
//#endregion
//#region vendor/workflow-engine/protocol.ts
/**
* The host⇄worker wire protocol: one string-valued enum of message tags per direction, a
* payload map giving each tag its parameters (the single source of truth), and the message
* unions derived from them. Payloads are plain JSON by construction for structured clone. Both
* directions are closed engine protocols. The host runtime-decodes the worker direction before
* dispatch; generic typed senders make tag/payload mismatches compile-time errors rather than
* silently skipped messages.
* @module @deepseek-ai/dsh-workflow-worker-thread/protocol
*/
/** A worker message failed the runtime protocol checks at the untrusted thread boundary. */
var WorkflowProtocolError = class extends Error {
	constructor(detail) {
		super(`invalid workflow worker message: ${detail}`);
		this.name = "WorkflowProtocolError";
	}
};
/** Convert one JSON snapshot to a record or reject it with a path-qualified diagnostic. */
function record(value, path) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new WorkflowProtocolError(`${path} must be an object`);
	return value;
}
/** Reject missing, extra, or inherited wire fields. */
function fields(value, path, required, optional = []) {
	const allowed = /* @__PURE__ */ new Set([...required, ...optional]);
	for (const key of required) if (!Object.hasOwn(value, key)) throw new WorkflowProtocolError(`${path}.${key} is required`);
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new WorkflowProtocolError(`${path}.${key} is not recognized`);
}
function string(value, path, empty = true) {
	if (typeof value !== "string" || !empty && value.length === 0) throw new WorkflowProtocolError(`${path} must be ${empty ? "a string" : "a non-empty string"}`);
	return value;
}
function integer(value, path, minimum) {
	if (!Number.isSafeInteger(value) || value < minimum) throw new WorkflowProtocolError(`${path} must be a safe integer no less than ${minimum}`);
	return value;
}
function optionalString(value, key, path) {
	return value[key] === void 0 ? void 0 : string(value[key], `${path}.${key}`);
}
function agentInfo(value, path) {
	const info = record(value, path);
	fields(info, path, [
		"seq",
		"label",
		"childId"
	], ["phase"]);
	const phase = optionalString(info, "phase", path);
	return {
		seq: integer(info.seq, `${path}.seq`, 1),
		label: string(info.label, `${path}.label`),
		...phase === void 0 ? {} : { phase },
		childId: string(info.childId, `${path}.childId`, false)
	};
}
function agentEndInfo(value) {
	const info = record(value, "message.info");
	fields(info, "message.info", [
		"seq",
		"label",
		"childId",
		"outcome"
	], ["phase"]);
	if (info.outcome !== "completed" && info.outcome !== "failed" && info.outcome !== "cancelled") throw new WorkflowProtocolError("message.info.outcome is not recognized");
	const phase = optionalString(info, "phase", "message.info");
	return {
		seq: integer(info.seq, "message.info.seq", 1),
		label: string(info.label, "message.info.label"),
		...phase === void 0 ? {} : { phase },
		childId: string(info.childId, "message.info.childId", false),
		outcome: info.outcome
	};
}
function gateInfo(value) {
	const gate = record(value, "message.gate");
	fields(gate, "message.gate", [
		"kind",
		"message",
		"resumable"
	]);
	if (gate.kind !== "user" && gate.kind !== "back_off" && gate.kind !== "no_progress" && gate.kind !== "verification" && gate.kind !== "infra") throw new WorkflowProtocolError("message.gate.kind is not recognized");
	if (typeof gate.resumable !== "boolean") throw new WorkflowProtocolError("message.gate.resumable must be a boolean");
	return {
		kind: gate.kind,
		message: string(gate.message, "message.gate.message"),
		resumable: gate.resumable
	};
}
function childStartRequest(value) {
	const request = record(value, "message.request");
	fields(request, "message.request", ["prompt"], [
		"schema",
		"provider",
		"model"
	]);
	const schema = request.schema;
	if (schema !== void 0) try {
		assertObjectJsonSchema(schema);
	} catch (error) {
		throw new WorkflowProtocolError(`message.request.schema is unsupported: ${String(error)}`);
	}
	const provider = optionalString(request, "provider", "message.request");
	const model = optionalString(request, "model", "message.request");
	return {
		prompt: string(request.prompt, "message.request.prompt", false),
		...schema === void 0 ? {} : { schema },
		...provider === void 0 ? {} : { provider },
		...model === void 0 ? {} : { model }
	};
}
function workflowResult(value) {
	const result = record(value, "message.result");
	fields(result, "message.result", [
		"value",
		"stopReason",
		"agentsStarted"
	], ["error", "errorCode"]);
	if (result.stopReason !== "completed" && result.stopReason !== "cancelled" && result.stopReason !== "error") throw new WorkflowProtocolError("message.result.stopReason is not recognized");
	const error = optionalString(result, "error", "message.result");
	const errorCode = result.errorCode === void 0 ? void 0 : workflowErrorCode(result.errorCode, "message.result.errorCode");
	if (result.stopReason === "completed" && (error !== void 0 || errorCode !== void 0)) throw new WorkflowProtocolError("message.result.error and errorCode are forbidden for a completed result");
	if (result.stopReason !== "completed" && error === void 0) throw new WorkflowProtocolError("message.result.error is required for a non-completed result");
	return {
		value: result.value,
		stopReason: result.stopReason,
		...error === void 0 ? {} : { error },
		...errorCode === void 0 ? {} : { errorCode },
		agentsStarted: integer(result.agentsStarted, "message.result.agentsStarted", 0)
	};
}
/** Compile-time-exhaustive runtime table for the seam's closed failure taxonomy. */
const WORKFLOW_ERROR_CODES = {
	SCRIPT_PARSE: "SCRIPT_PARSE",
	META_INVALID: "META_INVALID",
	INVALID_ARGUMENT: "INVALID_ARGUMENT",
	UNSUPPORTED_OPTION: "UNSUPPORTED_OPTION",
	UNSUPPORTED_SCHEMA: "UNSUPPORTED_SCHEMA",
	AGENT_CAP: "AGENT_CAP",
	ITEM_CAP: "ITEM_CAP",
	AGENT_START: "AGENT_START",
	AGENT_RESULT: "AGENT_RESULT",
	JOURNAL_DIVERGENCE: "JOURNAL_DIVERGENCE",
	RESULT_UNSERIALIZABLE: "RESULT_UNSERIALIZABLE",
	CANCELLED: "CANCELLED"
};
/** Decode one machine-routable workflow failure code. */
function workflowErrorCode(value, path) {
	if (typeof value !== "string" || !Object.hasOwn(WORKFLOW_ERROR_CODES, value)) throw new WorkflowProtocolError(`${path} is not recognized`);
	return WORKFLOW_ERROR_CODES[value];
}
function journalEntry(value) {
	const entry = record(value, "message.entry");
	const kind = string(entry.kind, "message.entry.kind", false);
	const fingerprint = string(entry.fingerprint, "message.entry.fingerprint", false);
	if (!/^[a-f0-9]{64}$/u.test(fingerprint)) throw new WorkflowProtocolError("message.entry.fingerprint must be a lowercase SHA-256 digest");
	const base = {
		ordinal: integer(entry.ordinal, "message.entry.ordinal", 1),
		callId: journalCallId(entry.callId),
		fingerprint
	};
	switch (kind) {
		case "agent":
			fields(entry, "message.entry", [
				"kind",
				"ordinal",
				"callId",
				"fingerprint",
				"seq",
				"result"
			]);
			return {
				...base,
				kind,
				seq: integer(entry.seq, "message.entry.seq", 1),
				result: entry.result
			};
		case "phase":
			fields(entry, "message.entry", [
				"kind",
				"ordinal",
				"callId",
				"fingerprint",
				"title"
			]);
			return {
				...base,
				kind,
				title: string(entry.title, "message.entry.title", false)
			};
		case "log":
			fields(entry, "message.entry", [
				"kind",
				"ordinal",
				"callId",
				"fingerprint",
				"message"
			]);
			return {
				...base,
				kind,
				message: string(entry.message, "message.entry.message")
			};
		case "scratch-write":
		case "await-user":
			fields(entry, "message.entry", [
				"kind",
				"ordinal",
				"callId",
				"fingerprint"
			]);
			return {
				...base,
				kind
			};
		case "scratch-read": {
			fields(entry, "message.entry", [
				"kind",
				"ordinal",
				"callId",
				"fingerprint"
			], ["content"]);
			const content = optionalString(entry, "content", "message.entry");
			return {
				...base,
				kind,
				...content === void 0 ? {} : { content }
			};
		}
		default: throw new WorkflowProtocolError("message.entry.kind is not recognized");
	}
}
/** Decode one non-empty deterministic positive-integer call path. */
function journalCallId(value) {
	if (!Array.isArray(value) || value.length === 0) throw new WorkflowProtocolError("message.entry.callId must be a non-empty integer array");
	return value.map((part, index) => integer(part, `message.entry.callId[${index}]`, 1));
}
/**
* Decode and detach one worker→host message before any observer, filesystem,
* or subagent side effect. The worker is model-script controlled after a VM
* escape, so TypeScript's protocol union is not evidence at this boundary.
* @param value - raw structured-clone payload received from the Worker.
* @param maxBytes - maximum UTF-8 JSON size accepted for one frame.
* @returns a detached, strictly validated protocol message.
*/
function decodeWorkerToHostMessage(value, maxBytes = Number.MAX_SAFE_INTEGER) {
	let detached;
	try {
		detached = snapshotJsonValue(value);
	} catch (error) {
		throw new WorkflowProtocolError(`message could not be read as JSON data: ${String(error)}`);
	}
	if (detached === void 0) throw new WorkflowProtocolError("message must be lossless JSON data");
	const encoded = JSON.stringify(detached);
	if (Buffer$1.byteLength(encoded, "utf8") > maxBytes) throw new WorkflowProtocolError(`message exceeds the ${maxBytes}-byte protocol limit`);
	const message = record(detached, "message");
	const type = string(message.type, "message.type", false);
	switch (type) {
		case "ready":
			fields(message, "message", ["type"]);
			return { type };
		case "phase":
			fields(message, "message", ["type", "title"]);
			return {
				type,
				title: string(message.title, "message.title", false)
			};
		case "log":
			fields(message, "message", ["type", "message"]);
			return {
				type,
				message: string(message.message, "message.message")
			};
		case "agent-start":
			fields(message, "message", ["type", "info"]);
			return {
				type,
				info: agentInfo(message.info, "message.info")
			};
		case "agent-end":
			fields(message, "message", ["type", "info"]);
			return {
				type,
				info: agentEndInfo(message.info)
			};
		case "gate":
			fields(message, "message", ["type", "gate"]);
			return {
				type,
				gate: gateInfo(message.gate)
			};
		case "journal-commit":
			fields(message, "message", ["type", "entry"]);
			return {
				type,
				entry: journalEntry(message.entry)
			};
		case "child-start":
			fields(message, "message", [
				"type",
				"callId",
				"request"
			]);
			return {
				type,
				callId: integer(message.callId, "message.callId", 1),
				request: childStartRequest(message.request)
			};
		case "child-dispose":
			fields(message, "message", ["type", "callId"]);
			return {
				type,
				callId: integer(message.callId, "message.callId", 1)
			};
		case "scratch-write":
			fields(message, "message", [
				"type",
				"callId",
				"name",
				"content"
			]);
			return {
				type,
				callId: integer(message.callId, "message.callId", 1),
				name: string(message.name, "message.name", false),
				content: string(message.content, "message.content")
			};
		case "scratch-read":
			fields(message, "message", [
				"type",
				"callId",
				"name"
			]);
			return {
				type,
				callId: integer(message.callId, "message.callId", 1),
				name: string(message.name, "message.name", false)
			};
		case "result":
			fields(message, "message", ["type", "result"]);
			return {
				type,
				result: workflowResult(message.result)
			};
		default: throw new WorkflowProtocolError(`message.type ${JSON.stringify(type)} is not recognized`);
	}
}
//#endregion
//#region vendor/workflow-engine/host.ts
/**
* Host side of one workflow run. The first worker result, unexpected death, or
* cancellation-grace expiry owns settlement and closes message admission.
* Pending starts share one abort signal; published children share idempotent
* cleanup, and quiescence waits for both while synthesizing any missing end events.
* @module @deepseek-ai/dsh-workflow-worker-thread/host
*/
/** Single-component scratch file name grammar (mirrors the worker-side validation). */
const SCRATCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/**
* Build the credential-free environment inherited by a workflow worker.
* Windows receives only its absolute temp directory; source workers may also
* receive the tsx paths-map pin used by the source launcher.
* @param platform - host platform, overridable for tests.
* @param tsconfigPath - optional source-launcher tsconfig pin.
* @returns the environment passed to the Worker constructor.
*/
function workerSpawnEnv(platform = process.platform, tsconfigPath) {
	const env = {};
	if (platform === "win32") {
		const tmp = tmpdir();
		env.TMP = tmp;
		env.TEMP = tmp;
	}
	if (tsconfigPath !== void 0) env.TSX_TSCONFIG_PATH = tsconfigPath;
	return env;
}
/** Resolve the built worker or source-mode tsx bootstrap for one isolated run. */
function resolveWorkerSpawn(init) {
	/* v8 ignore next 3 -- built-output arm is exercised by the built-worker e2e */
	if (!import.meta.url.endsWith(".ts")) return {
		entry: fileURLToPath(new URL("./worker.cjs", import.meta.url)),
		options: {
			workerData: init,
			env: workerSpawnEnv(),
			execArgv: []
		}
	};
	const workerEntry = new URL("./worker.ts", import.meta.url);
	const tsxEsmApiEntry = import.meta.resolve("tsx/esm/api");
	const tsxCjsApiEntry = import.meta.resolve("tsx/cjs/api");
	const bootstrap = [
		`import { register as registerEsm } from ${JSON.stringify(tsxEsmApiEntry)}`,
		`import { register as registerCjs } from ${JSON.stringify(tsxCjsApiEntry)}`,
		"registerCjs()",
		"registerEsm()",
		`await import(${JSON.stringify(workerEntry.href)})`
	].join("\n");
	return {
		entry: new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`),
		options: {
			workerData: init,
			env: workerSpawnEnv(void 0, process.env.TSX_TSCONFIG_PATH),
			execArgv: []
		}
	};
}
/**
* One live worker-engine run — the seam's {@link WorkflowRun}, returned by
* `start()` directly. Owns the Worker, the child registry, and the result
* settlement; `result` never rejects. `meta` is trusted same-process data
* borrowed as immutable by the handle and lifecycle events. The holder-bound
* SubagentRuntime handle is captured before the
* engine returns this run, so unloading the engine removes only the ability to
* start another workflow; this run can still start and clean up its children.
*/
var WorkerRun = class {
	constructor(ctx, subagents, id, meta, parent, init, provider, disposeGraceMs, observer, signal, scratchDir, hostLimits, deferStart = false, scratchPort = void 0) {
		this.ctx = ctx;
		this.subagents = subagents;
		this.id = id;
		this.meta = meta;
		this.parent = parent;
		this.init = init;
		this.provider = provider;
		this.disposeGraceMs = disposeGraceMs;
		this.observer = observer;
		this.scratchDir = scratchDir;
		this.hostLimits = hostLimits;
		this.deferStart = deferStart;
		this.scratchPort = scratchPort;
		this.settled = false;
		this.finalAgentSpend = 0;
		this.terminalClaimed = false;
		this.workerDeathObserved = false;
		this.workerGone = false;
		this.workerReady = false;
		this.released = false;
		this.hostStarted = 0;
		this.children = /* @__PURE__ */ new Map();
		this.pendingStarts = /* @__PURE__ */ new Set();
		this.activeChildCallIds = /* @__PURE__ */ new Set();
		this.claimedCallIds = /* @__PURE__ */ new Set();
		this.childCallIds = /* @__PURE__ */ new Set();
		this.disposedChildCallIds = /* @__PURE__ */ new Set();
		this.reapedChildCallIds = /* @__PURE__ */ new Set();
		this.announcedChildren = /* @__PURE__ */ new Set();
		this.agentChildren = /* @__PURE__ */ new Map();
		this.announcedAgentSeqs = /* @__PURE__ */ new Set();
		this.committedAgentSeqs = /* @__PURE__ */ new Set();
		this.committedJournalCallIds = /* @__PURE__ */ new Set();
		this.lastJournalOrdinal = 0;
		this.liveAgents = /* @__PURE__ */ new Map();
		this.pendingScratch = /* @__PURE__ */ new Set();
		this.scratchOperations = 0;
		this.scratchTail = Promise.resolve();
		this.scratchController = new AbortController();
		this.drainingWorkerResult = false;
		this.quiescenceWaiters = [];
		this.controller = new AbortController();
		this.result = new Promise((resolve) => {
			this.settleResolve = resolve;
		});
		const initialJournal = JSON.stringify(init.journal ?? []);
		this.journalBytes = Buffer$1.byteLength(initialJournal, "utf8");
		this.journalEntries = init.journal?.length ?? 0;
		this.journal = [...init.journal ?? []];
		for (const entry of init.journal ?? []) {
			this.committedJournalCallIds.add(entry.callId.join("."));
			this.lastJournalOrdinal = entry.ordinal;
		}
		if (this.journalBytes > hostLimits.maxJournalBytes) throw new WorkflowError$1(`workflow journal exceeds the ${hostLimits.maxJournalBytes}-byte limit before this attempt starts`, "INVALID_ARGUMENT");
		const { entry, options } = resolveWorkerSpawn(init);
		this.worker = new Worker(entry, options);
		this.worker.on("message", (message) => {
			this.onRawMessage(message);
		});
		this.worker.on("error", (error) => {
			this.onWorkerDeath(`workflow worker failed: ${renderThrown(error)}`, false);
		});
		/* v8 ignore next -- messageerror: not constructible from the engine's own protocol (every payload is JSON data) */
		this.worker.on("messageerror", (error) => {
			this.onWorkerDeath(`workflow worker message failed to deserialize: ${renderThrown(error)}`, false);
		});
		this.worker.on("exit", (code) => {
			this.workerGone = true;
			this.onWorkerDeath(`workflow worker exited before the run settled (exit code ${code})`, true);
		});
		if (signal?.aborted) this.cancel("workflow start signal already aborted");
		else if (signal !== void 0) {
			const onAbort = () => {
				this.detachInputSignal();
				this.cancel("workflow signal aborted");
			};
			this.inputSignal = signal;
			this.inputSignalAbort = onAbort;
			signal.addEventListener("abort", onAbort, { once: true });
		}
	}
	/**
	* Cancel the run: the worker is told (its hooks start throwing and the
	* script dies at its next await), the required signal shared by every child
	* start is aborted, and the grace timer
	* arms: a run still unsettled `disposeGraceMs` later force-settles
	* `cancelled` and its worker is TERMINATED. Idempotent; the first reason
	* wins.
	* @param reason - human-readable cause (default `'workflow cancelled'`).
	*/
	cancel(reason) {
		if (this.settled || this.terminalClaimed && !this.drainingWorkerResult || this.cancelReason !== void 0) return;
		this.cancelReason = reason ?? "workflow cancelled";
		this.post("cancel", { reason: this.cancelReason });
		this.abortChildren(this.cancelReason);
		if (!this.scratchController.signal.aborted) this.scratchController.abort(this.cancelReason);
		this.graceTimer = setTimeout(() => {
			this.terminalClaimed = true;
			this.endStrandedAgents();
			this.settleResult(this.cancelledResult(this.observedAgentSpend()));
			this.worker.terminate();
		}, this.disposeGraceMs);
		this.graceTimer.unref();
	}
	/**
	* Release a parked script gate. A no-op once the run settled or a cancel is
	* already in flight (the cancel path owns the terminal state then).
	*/
	resume() {
		if (this.settled || this.terminalClaimed || this.cancelReason !== void 0) return;
		this.post("resume", {});
	}
	/** Release a deferred fresh attempt exactly once. */
	release() {
		if (this.released || this.settled || this.cancelReason !== void 0) return;
		this.released = true;
		if (this.workerReady) this.post("go", {});
	}
	/** Return replay authority only after terminal settlement. */
	checkpoint() {
		if (!this.settled) return void 0;
		const initialSpend = this.init.initialAgentSpend ?? 0;
		const cumulativeSpend = Math.max(this.observedAgentSpend(), this.finalAgentSpend);
		return {
			journal: this.journal.map((entry) => ({
				...entry,
				callId: [...entry.callId]
			})),
			agentSpend: cumulativeSpend,
			agentSeq: Math.max(cumulativeSpend, this.init.initialAgentSeq ?? 0, (this.init.initialAgentSeq ?? 0) + Math.max(0, cumulativeSpend - initialSpend), ...this.announcedAgentSeqs, ...this.journal.flatMap((entry) => entry.kind === "agent" ? [entry.seq] : []))
		};
	}
	/**
	* Cancel + bounded settle + termination. Host-drives every registered
	* child's disposal IMMEDIATELY — a wedged worker can relay no dispose RPC,
	* and deferring child teardown to the post-terminate reap would spend the
	* whole grace waiting for a quiescence that cannot start, then return with
	* the disposals still in flight — so child disposal overlaps the same
	* grace the worker gets to settle (the worker's own dispose RPCs join the
	* shared per-child disposal). Waits (at most the grace) for the result and
	* child quiescence, then terminates the worker unconditionally — the
	* thread never outlives its run — and reaps whatever children remain
	* (their disposal is contained, not awaited past the grace, the same
	* abandonment the seam documents for a slow-disposing child). Idempotent;
	* safe on every path.
	* @returns resolves when the run's resources are released or abandoned.
	*/
	dispose() {
		if (this.disposed !== void 0) return this.disposed;
		const claimed = Promise.withResolvers();
		this.disposed = claimed.promise;
		(async () => {
			this.detachInputSignal();
			this.cancel("workflow disposed");
			this.reapChildren("workflow disposed");
			await Promise.race([(async () => {
				await this.result;
				await this.runQuiescence();
			})(), sleep(this.disposeGraceMs)]);
			await this.worker.terminate();
			this.reapChildren("workflow disposed");
		})().then(
			() => {
				claimed.resolve(void 0);
			},
			/* v8 ignore next -- result/quiescence never reject and Worker.terminate is the only external promise */
			(error) => {
				claimed.reject(error);
			}
		);
		return this.disposed;
	}
	/** Post one message to the worker (payload looked up from the tag's map entry), tolerating a thread that is already gone. */
	post(type, payload) {
		if (this.workerGone || this.workerDeathObserved) return;
		try {
			this.worker.postMessage({
				type,
				...payload
			});
		} catch (error) {
			/* v8 ignore next -- postMessage teardown race (a throw between exit and its event): not constructible in-process */
			this.ctx.logger.warn(`workflow-worker-thread: postMessage failed: ${renderThrown(error)}`);
		}
	}
	/** Decode one untrusted worker frame and contain protocol failures to this run. */
	onRawMessage(raw) {
		if (this.workerDeathObserved || this.terminalClaimed) return;
		try {
			this.onMessage(decodeWorkerToHostMessage(raw, this.hostLimits.maxProtocolMessageBytes));
		} catch (error) {
			const detail = error instanceof WorkflowProtocolError ? error.message : renderThrown(error);
			this.onWorkerDeath(`workflow worker protocol violation: ${detail}`, false);
			this.worker.terminate();
		}
	}
	onMessage(message) {
		if (!this.workerReady && message.type !== "ready") throw new WorkflowProtocolError(`${message.type} arrived before ready`);
		switch (message.type) {
			case "ready":
				if (this.workerReady) throw new WorkflowProtocolError("ready arrived more than once");
				this.workerReady = true;
				if (!this.deferStart || this.released) this.post("go", {});
				break;
			case "phase":
				this.assertEventText(message.title, "phase title");
				if (this.cancelReason === void 0 && !this.terminalClaimed) this.observer.phase(message.title);
				break;
			case "log":
				this.assertEventText(message.message, "log message");
				if (this.cancelReason === void 0 && !this.terminalClaimed) this.observer.log(message.message);
				break;
			case "agent-start":
				this.onAgentStart(message.info);
				break;
			case "agent-end":
				this.onAgentEnd(message.info);
				break;
			case "gate":
				this.assertEventText(message.gate.message, "gate message");
				if (this.cancelReason === void 0 && !this.terminalClaimed) this.observer.gate(message.gate);
				break;
			case "journal-commit":
				this.onJournalCommit(message.entry);
				break;
			case "scratch-write":
				this.onScratchWrite(message.callId, message.name, message.content);
				break;
			case "scratch-read":
				this.onScratchRead(message.callId, message.name);
				break;
			case "child-start":
				this.onChildStart(message.callId, message.request);
				break;
			case "child-dispose":
				this.onChildDispose(message.callId);
				break;
			case "result": this.onResult(message.result);
		}
	}
	/** Why a ready provider result may no longer be admitted to the worker. */
	childAdmissionFailure() {
		if (this.cancelReason !== void 0) return {
			reason: this.cancelReason,
			rendered: `workflow run cancelled: ${this.cancelReason}`
		};
		if (this.workerDeathObserved) return {
			reason: "workflow worker gone",
			rendered: "workflow worker is no longer available"
		};
		if (this.terminalClaimed) return {
			reason: "workflow settled",
			rendered: "workflow run already settled"
		};
	}
	/** Reserve a worker RPC id exactly once across every side-effecting family. */
	claimCallId(callId, operation) {
		if (this.claimedCallIds.has(callId)) throw new WorkflowProtocolError(`${operation} reused callId ${callId}`);
		this.claimedCallIds.add(callId);
	}
	/** Bound observer text before retaining or dispatching worker-controlled content. */
	assertEventText(value, label) {
		if (Buffer$1.byteLength(value, "utf8") > this.hostLimits.maxEventTextBytes) throw new WorkflowProtocolError(`${label} exceeds the ${this.hostLimits.maxEventTextBytes}-byte limit`);
	}
	/** Admit one lifecycle start only for a child the host actually published. */
	onAgentStart(info) {
		if (this.cancelReason !== void 0 || this.terminalClaimed) return;
		this.assertEventText(info.label, "agent label");
		if (info.phase !== void 0) this.assertEventText(info.phase, "agent phase");
		const priorSequence = this.init.initialAgentSeq ?? 0;
		if (info.seq <= priorSequence) throw new WorkflowProtocolError(`agent-start seq ${info.seq} does not advance prior seq ${priorSequence}`);
		if (info.seq > priorSequence + this.hostStarted) throw new WorkflowProtocolError(`agent-start seq ${info.seq} exceeds the host-observed sequence range`);
		if (this.announcedAgentSeqs.has(info.seq)) throw new WorkflowProtocolError(`agent-start reused seq ${info.seq}`);
		if (this.announcedChildren.has(info.childId)) throw new WorkflowProtocolError(`agent-start reused child id ${JSON.stringify(info.childId)}`);
		const published = [...this.children.values()].find((record) => record.run.id === info.childId);
		if (!published) throw new WorkflowProtocolError(`agent-start references unpublished child ${JSON.stringify(info.childId)}`);
		this.announcedChildren.add(info.childId);
		this.announcedAgentSeqs.add(info.seq);
		this.agentChildren.set(info.seq, published);
		this.liveAgents.set(info.seq, info);
		this.observer.agentStart(info);
	}
	/** Require one end to match the exact start snapshot before forwarding it. */
	onAgentEnd(info) {
		const start = this.liveAgents.get(info.seq);
		if (start === void 0) {
			if (this.cancelReason !== void 0 || this.terminalClaimed) return;
			throw new WorkflowProtocolError(`agent-end references unknown seq ${info.seq}`);
		}
		if (start.label !== info.label || start.phase !== info.phase || start.childId !== info.childId) throw new WorkflowProtocolError(`agent-end metadata does not match agent-start seq ${info.seq}`);
		if (this.cancelReason !== void 0) {
			this.endAgent({
				...start,
				outcome: "cancelled"
			});
			return;
		}
		const child = this.agentChildren.get(info.seq);
		if (child === void 0) throw new WorkflowProtocolError(`agent-end seq ${info.seq} lost its host child correlation`);
		const committed = this.committedAgentSeqs.has(info.seq);
		if (info.outcome === "cancelled") throw new WorkflowProtocolError(`agent-end seq ${info.seq} reported cancellation before the run was cancelled`);
		if (info.outcome === "completed" && (!committed || child.resultState !== "settled")) throw new WorkflowProtocolError(`agent-end seq ${info.seq} settled without a committed result`);
		if (info.outcome === "failed" && !(committed && child.resultState === "settled" || !committed && child.resultState === "failed")) throw new WorkflowProtocolError(`agent-end seq ${info.seq} does not match the host-observed child result`);
		this.endAgent(info);
	}
	/** Commit one completed host call in monotonic order and at most once. */
	onJournalCommit(entry) {
		if (this.cancelReason !== void 0 || this.terminalClaimed) return;
		if (entry.ordinal !== this.lastJournalOrdinal + 1) throw new WorkflowProtocolError(`journal-commit ordinal ${entry.ordinal} does not follow ${this.lastJournalOrdinal}`);
		const callKey = entry.callId.join(".");
		if (this.committedJournalCallIds.has(callKey)) throw new WorkflowProtocolError(`journal-commit reused call identity ${JSON.stringify(entry.callId)}`);
		if (entry.kind === "agent") {
			if (!this.liveAgents.has(entry.seq)) throw new WorkflowProtocolError(`agent journal commit references unknown live seq ${entry.seq}`);
			if (this.agentChildren.get(entry.seq)?.resultState !== "settled") throw new WorkflowProtocolError(`agent journal commit seq ${entry.seq} arrived before a host-observed child result`);
			if (this.committedAgentSeqs.has(entry.seq)) throw new WorkflowProtocolError(`agent journal commit reused seq ${entry.seq}`);
		}
		const encodedEntry = JSON.stringify(entry);
		const addedBytes = Buffer$1.byteLength(encodedEntry, "utf8") + (this.journalEntries === 0 ? 0 : 1);
		if (addedBytes > this.hostLimits.maxJournalBytes - this.journalBytes) throw new WorkflowProtocolError(`journal-commit exceeds the ${this.hostLimits.maxJournalBytes}-byte journal limit`);
		if (entry.kind === "agent") this.committedAgentSeqs.add(entry.seq);
		this.committedJournalCallIds.add(callKey);
		this.journal.push(entry);
		this.lastJournalOrdinal = entry.ordinal;
		this.journalBytes += addedBytes;
		this.journalEntries += 1;
		this.observer.journalCommit(entry);
	}
	onChildStart(callId, request) {
		this.claimCallId(callId, "child-start");
		this.childCallIds.add(callId);
		if (Buffer$1.byteLength(request.prompt, "utf8") > this.hostLimits.maxChildPromptBytes) throw new WorkflowProtocolError(`child-start prompt exceeds the ${this.hostLimits.maxChildPromptBytes}-byte limit`);
		if ((this.init.initialAgentSpend ?? 0) + this.hostStarted >= this.init.limits.maxTotalAgents) throw new WorkflowProtocolError("child-start exceeds the host-enforced total agent cap");
		if (this.activeChildCallIds.size >= this.init.limits.maxConcurrentAgents) throw new WorkflowProtocolError("child-start exceeds the host-enforced concurrent agent cap");
		const initialFailure = this.childAdmissionFailure();
		if (initialFailure !== void 0) {
			this.post("child-start-error", {
				callId,
				rendered: initialFailure.rendered
			});
			return;
		}
		this.hostStarted += 1;
		this.activeChildCallIds.add(callId);
		const task = this.startChild(callId, request);
		this.pendingStarts.add(task);
		task.then(
			() => {
				this.finishPendingStart(task, callId);
			},
			/* v8 ignore next -- startChild contains provider and cleanup failures */
			() => {
				this.finishPendingStart(task, callId);
			}
		);
	}
	/** Await one provider-owned startup transaction and publish only while admitted. */
	async startChild(callId, request) {
		let run;
		try {
			run = await this.subagents.start(this.provider, {
				prompt: [{
					type: "text",
					text: request.prompt
				}],
				parent: this.parent,
				signal: this.controller.signal,
				...request.schema !== void 0 ? { outputSchema: request.schema } : {},
				...request.provider !== void 0 || request.model !== void 0 ? { agentOptions: {
					...request.provider !== void 0 ? { provider: request.provider } : {},
					...request.model !== void 0 ? { model: request.model } : {}
				} } : {}
			});
		} catch (error) {
			const failure = this.childAdmissionFailure();
			this.post("child-start-error", {
				callId,
				rendered: failure?.rendered ?? renderThrown(error)
			});
			return;
		}
		const failure = this.childAdmissionFailure();
		if (failure !== void 0) {
			this.post("child-start-error", {
				callId,
				rendered: failure.rendered
			});
			try {
				await run.dispose();
			} catch (error) {
				this.ctx.logger.warn(`workflow-worker-thread: refused child dispose failed: ${renderThrown(error)}`);
			}
			return;
		}
		const record = {
			run,
			resultState: "pending"
		};
		this.children.set(callId, record);
		const forwardResult = run.result.then((result) => {
			try {
				const snapshot = snapshotJsonValue({
					output: result.output,
					...result.structured !== void 0 ? { structured: result.structured } : {},
					stopReason: result.stopReason
				});
				if (snapshot === void 0) throw new TypeError("child result is not losslessly JSON-serializable");
				record.resultState = "settled";
				return () => {
					this.post("child-settled", {
						callId,
						result: snapshot
					});
				};
			} catch (error) {
				record.resultState = "failed";
				const rendered = `workflow child result could not cross the worker boundary: ${renderThrown(error)}`;
				return () => {
					this.post("child-failed", {
						callId,
						rendered
					});
				};
			}
		}, (error) => {
			record.resultState = "failed";
			const rendered = renderThrown(error);
			return () => {
				this.post("child-failed", {
					callId,
					rendered
				});
			};
		});
		this.post("child-started", {
			callId,
			childId: run.id
		});
		forwardResult.then((forward) => {
			forward();
		});
	}
	onChildDispose(callId) {
		if (!this.childCallIds.has(callId)) throw new WorkflowProtocolError(`child-dispose references unknown callId ${callId}`);
		if (this.disposedChildCallIds.has(callId)) throw new WorkflowProtocolError(`child-dispose repeated callId ${callId}`);
		this.disposedChildCallIds.add(callId);
		const record = this.children.get(callId);
		if (record === void 0) {
			if (!this.reapedChildCallIds.has(callId)) throw new WorkflowProtocolError(`child-dispose references child ${callId} before host-side disposal`);
			this.post("child-disposed", { callId });
			return;
		}
		this.disposeChild(callId, record).then(() => {
			this.post("child-disposed", { callId });
		});
	}
	/**
	* Start (or join) one registered child's disposal; the registry entry
	* leaves when it settles. Memoized per callId: the worker's dispose RPC,
	* the dispose() host drive, and the reap can all land on the same child —
	* the child's `dispose()` runs once and every caller awaits that one
	* settlement. A rejection is contained (the subagent seam's dispose() is
	* not supposed to reject, but a backend that does anyway must not break
	* quiescence): logged, and the child still leaves the registry.
	* @param callId - the child's registry key.
	* @param record - the registered child (the caller looked it up).
	* @returns resolves when the disposal settled either way; never rejects.
	*/
	disposeChild(callId, record) {
		if (record.disposal !== void 0) return record.disposal;
		record.disposal = Promise.resolve().then(() => record.run.dispose()).catch((error) => {
			this.ctx.logger.warn(`workflow-worker-thread: child dispose failed: ${renderThrown(error)}`);
		}).then(() => {
			this.finishChild(callId);
		});
		return record.disposal;
	}
	/** Drop a child record and release quiescence waiters when all work ends. */
	finishChild(callId) {
		this.children.delete(callId);
		this.reapedChildCallIds.add(callId);
		this.activeChildCallIds.delete(callId);
		this.notifyRunQuiescence();
	}
	/** Retire one provider startup transaction. */
	finishPendingStart(task, callId) {
		this.pendingStarts.delete(task);
		if (!this.children.has(callId)) this.activeChildCallIds.delete(callId);
		this.notifyRunQuiescence();
	}
	/** Release waiters only after provider, child, and scratch work ends. */
	notifyRunQuiescence() {
		if (this.children.size !== 0 || this.pendingStarts.size !== 0 || this.pendingScratch.size !== 0) return;
		for (const waiter of this.quiescenceWaiters.splice(0)) waiter();
	}
	/** Resolves once every pending start, child, and admitted scratch operation is quiescent. */
	runQuiescence() {
		if (this.children.size === 0 && this.pendingStarts.size === 0 && this.pendingScratch.size === 0) return Promise.resolve();
		return new Promise((resolve) => {
			this.quiescenceWaiters.push(resolve);
		});
	}
	/** Abort + dispose every registered child (worker death / final teardown); disposal is contained, not awaited. */
	reapChildren(reason) {
		this.abortChildren(this.cancelReason ?? reason);
		for (const [callId, record] of [...this.children]) this.disposeChild(callId, record);
	}
	/** Abort the one canonical signal shared by pending and published children. */
	abortChildren(reason) {
		if (!this.controller.signal.aborted) this.controller.abort(reason);
	}
	onResult(result) {
		const cancellationWasRequested = this.cancelReason !== void 0;
		const observedSpend = this.observedAgentSpend();
		if (result.agentsStarted < observedSpend) throw new WorkflowProtocolError(`result agentsStarted ${result.agentsStarted} is below the host-observed spend ${observedSpend}`);
		if (result.agentsStarted > this.init.limits.maxTotalAgents) throw new WorkflowProtocolError(`result agentsStarted ${result.agentsStarted} exceeds the ${this.init.limits.maxTotalAgents}-agent cap`);
		this.terminalClaimed = true;
		this.reapChildren("workflow settled");
		this.endStrandedAgents();
		this.drainingWorkerResult = true;
		this.settleAfterScratch(result, cancellationWasRequested);
	}
	/** Drain admitted scratch effects before publishing the worker-selected outcome. */
	async settleAfterScratch(result, cancellationWasRequested) {
		await this.scratchQuiescence();
		/* v8 ignore next -- scratch quiescence resolves before any competing settle can pass the terminal claim */
		if (this.settled) return;
		if (cancellationWasRequested || this.cancelReason !== void 0) {
			this.settleResult(result.stopReason === "cancelled" ? result : this.cancelledResult(result.agentsStarted));
			return;
		}
		/* v8 ignore start -- deterministic tests cannot order Result ahead of
		* scratch-failure termination; onScratchFailure covers I/O failure. */
		if (this.scratchFailure !== void 0) {
			this.settleResult({
				value: null,
				stopReason: "error",
				error: this.scratchFailure,
				agentsStarted: result.agentsStarted
			});
			return;
		}
		/* v8 ignore stop */
		this.settleResult(result);
	}
	/** Serve one quota-checked, atomic scratch write. */
	onScratchWrite(callId, name, content) {
		this.claimScratchCall(callId, name, "scratch-write");
		return this.trackScratch(async () => {
			this.scratchController.signal.throwIfAborted();
			if (this.scratchPort !== void 0) {
				await this.scratchPort.write(name, content, this.scratchController.signal);
				this.post("scratch-written", { callId });
				return;
			}
			const state = await this.getScratchState();
			if (state === void 0) {
				this.post("scratch-written", { callId });
				return;
			}
			await this.writeScratch(state, name, content);
			this.post("scratch-written", { callId });
		});
	}
	/** Serve one no-follow, bounded scratch read. */
	onScratchRead(callId, name) {
		this.claimScratchCall(callId, name, "scratch-read");
		return this.trackScratch(async () => {
			this.scratchController.signal.throwIfAborted();
			if (this.scratchPort !== void 0) {
				const content = await this.scratchPort.read(name, this.scratchController.signal);
				this.post("scratch-read-result", {
					callId,
					...content === void 0 ? {} : { content }
				});
				return;
			}
			const state = await this.getScratchState();
			if (state === void 0) {
				this.post("scratch-read-result", { callId });
				return;
			}
			const content = await this.readScratch(state, name);
			this.post("scratch-read-result", {
				callId,
				...content === void 0 ? {} : { content }
			});
		});
	}
	/** Validate one scratch RPC before queueing any filesystem work. */
	claimScratchCall(callId, name, operation) {
		if (!SCRATCH_NAME.test(name)) throw new WorkflowProtocolError(`${operation} name must be one safe path component`);
		if (this.cancelReason !== void 0 || this.workerDeathObserved || this.terminalClaimed) throw new WorkflowProtocolError(`${operation} arrived after the run stopped admitting effects`);
		if (this.scratchOperations >= this.hostLimits.scratch.maxOperations) throw new WorkflowProtocolError(`${operation} exceeds the ${this.hostLimits.scratch.maxOperations}-operation scratch limit`);
		if (this.pendingScratch.size >= this.hostLimits.scratch.maxPendingOperations) throw new WorkflowProtocolError(`${operation} exceeds the ${this.hostLimits.scratch.maxPendingOperations}-operation pending scratch limit`);
		this.claimCallId(callId, operation);
		this.scratchOperations += 1;
	}
	/** Serialize, retain, and contain one admitted scratch operation. */
	trackScratch(operation) {
		const execution = this.scratchTail.then(operation);
		this.scratchTail = execution.catch(() => {});
		const tracked = execution.then(() => {}, (error) => {
			this.onScratchFailure(error);
		});
		this.pendingScratch.add(tracked);
		tracked.then(() => {
			this.pendingScratch.delete(tracked);
			this.notifyRunQuiescence();
		});
		return tracked;
	}
	/** Resolve once every scratch operation admitted before the terminal frame is quiescent. */
	scratchQuiescence() {
		if (this.pendingScratch.size === 0) return Promise.resolve();
		return Promise.all([...this.pendingScratch]).then(() => {});
	}
	/** Turn a scratch quota, integrity, or I/O failure into a run-local terminal error. */
	onScratchFailure(error) {
		if (this.cancelReason !== void 0) return;
		if (this.scratchFailure !== void 0) return;
		this.scratchFailure = `workflow scratch operation failed: ${renderThrown(error)}`;
		if (!this.scratchController.signal.aborted) this.scratchController.abort(this.scratchFailure);
		this.onWorkerDeath(this.scratchFailure, false);
		this.worker.terminate();
	}
	/** Initialize scratch storage at first use, never merely because a run started. */
	getScratchState() {
		const existing = this.scratchState;
		if (existing !== void 0) return existing;
		const created = this.initializeScratch();
		this.scratchState = created;
		return created;
	}
	/** Verify/create the owner-private scratch directory and account retained files on resume. */
	async initializeScratch() {
		if (this.scratchDir === void 0) return void 0;
		const dir = join(this.scratchDir, "scratch");
		await mkdir(dir, {
			recursive: true,
			mode: 448
		});
		const directory = await lstat(dir);
		if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error("scratch path is not a real directory");
		await chmod(dir, 448);
		const files = /* @__PURE__ */ new Map();
		let totalBytes = 0;
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			if (!SCRATCH_NAME.test(entry.name) || !entry.isFile() || entry.isSymbolicLink()) throw new Error(`scratch directory contains an unsupported entry ${JSON.stringify(entry.name)}`);
			const file = await this.scratchFileState(join(dir, entry.name));
			if (file.size > this.hostLimits.scratch.maxFileBytes) throw new Error(`scratch file ${JSON.stringify(entry.name)} exceeds the per-file quota`);
			files.set(entry.name, file);
			totalBytes += file.size;
		}
		if (files.size > this.hostLimits.scratch.maxFiles) throw new Error(`scratch directory exceeds the ${this.hostLimits.scratch.maxFiles}-file quota`);
		if (totalBytes > this.hostLimits.scratch.maxTotalBytes) throw new Error(`scratch directory exceeds the ${this.hostLimits.scratch.maxTotalBytes}-byte quota`);
		return {
			dir,
			device: directory.dev,
			inode: directory.ino,
			files,
			totalBytes
		};
	}
	/** Inspect one singly linked scratch path without following a final symlink. */
	async scratchFileState(path) {
		const before = await lstat(path);
		if (!before.isFile() || before.isSymbolicLink()) throw new Error(`scratch path ${JSON.stringify(path)} is not a regular file`);
		if (before.nlink !== 1) throw new Error(`scratch path ${JSON.stringify(path)} has multiple hard links`);
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const info = await handle.stat();
			/* v8 ignore next -- a non-file descriptor requires a path replacement between lstat() and open(). */
			if (!info.isFile()) throw new Error(`scratch path ${JSON.stringify(path)} is not a regular file`);
			/* v8 ignore next -- inode mismatch requires a path replacement between lstat() and open(). */
			if (info.dev !== before.dev || info.ino !== before.ino)
 /* v8 ignore next */
			throw new Error(`scratch path ${JSON.stringify(path)} changed while opening`);
			/* v8 ignore next -- link-count change requires an external hard-link race after lstat(). */
			if (info.nlink !== 1)
 /* v8 ignore next */
			throw new Error(`scratch path ${JSON.stringify(path)} gained a hard link while opening`);
			/* v8 ignore next -- Node fs.Stat.size is always a non-negative safe integer for an opened local file. */
			if (!Number.isSafeInteger(info.size) || info.size < 0) throw new Error("scratch file size is invalid");
			await handle.chmod(384);
			return {
				device: info.dev,
				inode: info.ino,
				size: info.size
			};
		} finally {
			await handle.close();
		}
	}
	/** Atomically publish one owner-only scratch file after quota admission. */
	async writeScratch(state, name, content) {
		this.scratchController.signal.throwIfAborted();
		await this.assertScratchDirectory(state);
		const bytes = Buffer$1.from(content, "utf8");
		const limits = this.hostLimits.scratch;
		if (bytes.length > limits.maxFileBytes) throw new Error(`scratch file ${JSON.stringify(name)} exceeds the ${limits.maxFileBytes}-byte per-file quota`);
		const previous = state.files.get(name);
		if (previous === void 0 && state.files.size >= limits.maxFiles) throw new Error(`scratch write exceeds the ${limits.maxFiles}-file quota`);
		const nextTotal = state.totalBytes - (previous?.size ?? 0) + bytes.length;
		if (nextTotal > limits.maxTotalBytes) throw new Error(`scratch write exceeds the ${limits.maxTotalBytes}-byte total quota`);
		const target = join(state.dir, name);
		const temporary = join(state.dir, `.${randomBytes(12).toString("hex")}.tmp`);
		const backup = join(state.dir, `.${randomBytes(12).toString("hex")}.bak`);
		let handle;
		let staged;
		let previousMoved = false;
		let published = false;
		try {
			handle = await open(temporary, "wx", 384);
			await handle.chmod(384);
			await handle.writeFile(bytes, { signal: this.scratchController.signal });
			await handle.sync();
			const stagedInfo = await handle.stat();
			/* v8 ignore next -- the owner-held wx descriptor cannot change file type; link-count mutation needs an external race. */
			if (!stagedInfo.isFile() || stagedInfo.nlink !== 1)
 /* v8 ignore next */
			throw new Error("scratch temporary path changed while writing");
			staged = {
				device: stagedInfo.dev,
				inode: stagedInfo.ino,
				size: bytes.length
			};
			await handle.close();
			handle = void 0;
			this.scratchController.signal.throwIfAborted();
			await this.assertScratchDirectory(state);
			if (previous !== void 0) {
				await this.assertScratchFileIdentity(target, previous);
				await rename(target, backup);
				previousMoved = true;
				await this.assertScratchFileIdentity(backup, previous);
				this.scratchController.signal.throwIfAborted();
			}
			await link(temporary, target);
			published = true;
			await this.assertScratchFileIdentity(target, staged, true);
			await rm(temporary);
			await this.assertScratchFileIdentity(target, staged);
			state.files.set(name, staged);
			state.totalBytes = nextTotal;
			if (previousMoved && previous !== void 0) {
				await this.assertScratchFileIdentity(backup, previous);
				await rm(backup);
				previousMoved = false;
			}
		} catch (error) {
			if (previousMoved && !published) await link(backup, target).catch(() => {});
			throw error;
		} finally {
			/* v8 ignore next -- reaching cleanup with an open handle requires an injected fs write/sync failure. */
			if (handle !== void 0) await handle.close().catch(() => {});
			/* v8 ignore next -- cleanup failures are deliberately swallowed after the primary transaction failure. */
			if (!published) await rm(temporary, { force: true }).catch(() => {});
		}
	}
	/** Read one expected regular file through an owner-held no-follow descriptor. */
	async readScratch(state, name) {
		const expected = state.files.get(name);
		if (expected === void 0) return void 0;
		this.scratchController.signal.throwIfAborted();
		await this.assertScratchDirectory(state);
		const path = join(state.dir, name);
		let before;
		try {
			before = await lstat(path);
		} catch (error) {
			/* v8 ignore next -- safe component + verified directory leaves ENOENT as the only ordinary lstat failure. */
			if (error.code !== "ENOENT") throw error;
			state.files.delete(name);
			state.totalBytes -= expected.size;
			return;
		}
		if (!before.isFile() || before.isSymbolicLink()) throw new Error(`scratch path ${JSON.stringify(name)} is not a regular file`);
		if (before.nlink !== 1) throw new Error(`scratch path ${JSON.stringify(name)} has multiple hard links`);
		if (before.dev !== expected.device || before.ino !== expected.inode) throw new Error(`scratch path ${JSON.stringify(name)} changed after initialization`);
		let handle;
		try {
			handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		} catch (error) {
			/* v8 ignore next -- after successful lstat, a non-ENOENT open failure requires an external permission/type race. */
			if (error.code !== "ENOENT") throw error;
			/* v8 ignore start -- disappearance between lstat() and open() is a real filesystem race that deterministic tests cannot order. */
			state.files.delete(name);
			state.totalBytes -= expected.size;
			return;
		}
		try {
			const info = await handle.stat();
			/* v8 ignore next -- a non-file descriptor requires a path replacement between lstat() and open(). */
			if (!info.isFile()) throw new Error(`scratch path ${JSON.stringify(name)} is not a regular file`);
			/* v8 ignore next -- inode mismatch requires a path replacement between lstat() and open(). */
			if (info.dev !== before.dev || info.ino !== before.ino)
 /* v8 ignore next */
			throw new Error(`scratch path ${JSON.stringify(name)} changed while opening`);
			/* v8 ignore next -- link-count change requires an external hard-link race after open(). */
			if (info.nlink !== 1)
 /* v8 ignore next */
			throw new Error(`scratch path ${JSON.stringify(name)} gained a hard link while opening`);
			if (info.size > this.hostLimits.scratch.maxFileBytes) throw new Error(`scratch file ${JSON.stringify(name)} exceeds the per-file quota`);
			const bytes = await handle.readFile({ signal: this.scratchController.signal });
			/* v8 ignore next -- growth after descriptor stat and before read completion is an external filesystem race. */
			if (bytes.length > this.hostLimits.scratch.maxFileBytes)
 /* v8 ignore next */
			throw new Error(`scratch file ${JSON.stringify(name)} grew beyond the per-file quota while reading`);
			const nextTotal = state.totalBytes - expected.size + bytes.length;
			if (nextTotal > this.hostLimits.scratch.maxTotalBytes) throw new Error("scratch directory grew beyond the total quota while reading");
			expected.size = bytes.length;
			state.totalBytes = nextTotal;
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} finally {
			await handle.close();
		}
	}
	/** Reject a scratch path whose current inode is not the transaction-owned file. */
	async assertScratchFileIdentity(path, expected, allowStagingLink = false) {
		const current = await lstat(path);
		if (!current.isFile() || current.isSymbolicLink() || current.dev !== expected.device || current.ino !== expected.inode || current.nlink !== (allowStagingLink ? 2 : 1)) throw new Error(`scratch file ${JSON.stringify(path)} changed during publication`);
	}
	/** Reject a scratch directory that was replaced after lazy initialization. */
	async assertScratchDirectory(state) {
		const current = await lstat(state.dir);
		if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== state.device || current.ino !== state.inode) throw new Error("scratch directory changed after initialization");
	}
	/** Process an error/messageerror/exit signal; `exit` also performs the final disposal sweep. */
	onWorkerDeath(message, isExit) {
		if (!this.workerDeathObserved) {
			this.workerDeathObserved = true;
			const outcomeWasClaimed = this.terminalClaimed;
			const cancellationWasRequested = this.cancelReason !== void 0;
			if (!outcomeWasClaimed && !this.scratchController.signal.aborted) this.scratchController.abort("workflow worker gone");
			if (!outcomeWasClaimed) this.terminalClaimed = true;
			if (this.children.size > 0 || this.pendingStarts.size > 0) this.reapChildren("workflow worker gone");
			this.endStrandedAgents();
			if (!outcomeWasClaimed) {
				if (cancellationWasRequested) this.settleResult(this.cancelledResult(this.observedAgentSpend()));
				else this.settleResult({
					value: null,
					stopReason: "error",
					error: message,
					agentsStarted: this.observedAgentSpend()
				});
			}
		}
		if (!isExit) return;
		for (const [callId, record] of [...this.children]) this.disposeChild(callId, record);
		this.endStrandedAgents();
	}
	/**
	* The single agent-end emission gate: forwards `end` iff its start is still
	* unpaired in the ledger, so every forwarded `workflow/agent-start` gets
	* EXACTLY one `workflow/agent-end` — the worker's own report where it can
	* speak, a host-synthesized one where it cannot ({@link endStrandedAgents}).
	* @param end - the settlement to emit (worker-reported or synthesized).
	*/
	endAgent(end) {
		/* v8 ignore next -- a real end still in flight across the grace force-settle: not orderable in-process */
		if (!this.liveAgents.delete(end.seq)) return;
		this.observer.agentEnd(end);
	}
	/**
	* Synthesize the missing `agent-end` for every started-but-unpaired agent,
	* outcome `'cancelled'`: the reap cancels every child, and a real
	* settlement racing the force-settle loses to that already-started external
	* cancellation. The atomic terminal boundaries in {@link onResult} and
	* {@link onWorkerDeath} deliberately exclude teardown callbacks as contenders.
	* Called where the worker can no longer speak (the grace force-settle,
	* worker death, physical exit). When grace/death is the terminal source it
	* runs before settleResult, so already-known pairs precede `workflow/end`;
	* after an earlier Result, exit cleanup may close a survivor afterward.
	* The ledger preserves exactly-once pairing in both orders.
	*/
	endStrandedAgents() {
		for (const info of [...this.liveAgents.values()]) this.endAgent({
			...info,
			outcome: "cancelled"
		});
	}
	cancelledResult(agentsStarted) {
		return {
			value: null,
			stopReason: "cancelled",
			error: `workflow run cancelled: ${this.cancelReason ?? "workflow cancelled"}`,
			errorCode: "CANCELLED",
			agentsStarted
		};
	}
	/** Cumulative logical-agent spend the host can prove across resume attempts. */
	observedAgentSpend() {
		return (this.init.initialAgentSpend ?? 0) + this.hostStarted;
	}
	/** Remove the exact abort callback installed on the caller's start signal. */
	detachInputSignal() {
		const signal = this.inputSignal;
		const onAbort = this.inputSignalAbort;
		if (signal === void 0 || onAbort === void 0) return;
		this.inputSignal = void 0;
		this.inputSignalAbort = void 0;
		signal.removeEventListener("abort", onAbort);
	}
	/** First settle wins; disarms the grace timer and releases the caller signal. */
	settleResult(result) {
		/* v8 ignore next -- defensive fallback outside the claimed state machine */
		if (this.settled) return;
		this.terminalClaimed = true;
		this.settled = true;
		this.finalAgentSpend = Math.max(this.finalAgentSpend, result.agentsStarted);
		this.detachInputSignal();
		clearTimeout(this.graceTimer);
		this.settleResolve(result);
	}
};
/** A plain timer sleep (the dispose grace); unref'd so it never holds the process open. */
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms).unref();
	});
}
//#endregion
//#region vendor/workflow-engine/meta.ts
/**
* Meta validation checks caller-provided DATA against the {@link WorkflowMeta}
* contract and rejects every violation by name. Meta arrives as schema-checked
* JSON data, never evaluated script text; evaluating it on the host could run getters outside the
* worker timeout that exists to isolate model-written code.
* @module @deepseek-ai/dsh-workflow-worker-thread/meta
*/
/** Collect shape violations for a meta value (plain JSON data by the seam contract). */
function validateMetaShape(meta) {
	const violations = [];
	if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return { violations: ["meta must be an object"] };
	const record = meta;
	const known = /* @__PURE__ */ new Set([
		"name",
		"description",
		"whenToUse",
		"phases"
	]);
	for (const key of Object.keys(record)) if (!known.has(key)) violations.push(`meta.${key} is not a recognized field (name/description/whenToUse/phases)`);
	if (typeof record.name !== "string" || record.name.length === 0) violations.push("meta.name must be a non-empty string");
	if (typeof record.description !== "string" || record.description.length === 0) violations.push("meta.description must be a non-empty string");
	if (record.whenToUse !== void 0 && typeof record.whenToUse !== "string") violations.push("meta.whenToUse must be a string");
	const phases = [];
	if (record.phases !== void 0) {
		if (!Array.isArray(record.phases)) violations.push("meta.phases must be an array");
		else record.phases.forEach((phase, index) => {
			if (typeof phase !== "object" || phase === null || Array.isArray(phase)) {
				violations.push(`meta.phases[${index}] must be an object`);
				return;
			}
			const entry = phase;
			for (const key of Object.keys(entry)) if (![
				"title",
				"detail",
				"provider",
				"model"
			].includes(key)) violations.push(`meta.phases[${index}].${key} is not a recognized field`);
			if (typeof entry.title !== "string" || entry.title.length === 0) violations.push(`meta.phases[${index}].title must be a non-empty string`);
			if (entry.detail !== void 0 && typeof entry.detail !== "string") violations.push(`meta.phases[${index}].detail must be a string`);
			if (entry.provider !== void 0 && typeof entry.provider !== "string") violations.push(`meta.phases[${index}].provider must be a string`);
			if (entry.model !== void 0 && typeof entry.model !== "string") violations.push(`meta.phases[${index}].model must be a string`);
			if (violations.length === 0) phases.push({
				title: entry.title,
				...entry.detail !== void 0 ? { detail: entry.detail } : {},
				...entry.provider !== void 0 ? { provider: entry.provider } : {},
				...entry.model !== void 0 ? { model: entry.model } : {}
			});
		});
	}
	if (violations.length > 0) return { violations };
	return {
		violations,
		meta: {
			name: record.name,
			description: record.description,
			...record.whenToUse !== void 0 ? { whenToUse: record.whenToUse } : {},
			...record.phases !== void 0 ? { phases } : {}
		}
	};
}
/**
* Validate a caller-provided meta value against the {@link WorkflowMeta}
* contract. Throws `META_INVALID` naming every violation (unknown fields,
* missing/mistyped `name`/`description`, malformed `phases`); the returned
* meta is a NORMALIZED copy built from the validated fields, so the engine
* never aliases the caller's object.
* @param value - the meta data from the start request (plain JSON by the seam contract).
* @returns the validated, normalized meta block.
*/
function validateMeta(value) {
	const { meta, violations } = validateMetaShape(value);
	if (meta === void 0) throw new WorkflowError(`invalid meta: ${violations.join("; ")}`, "META_INVALID");
	return meta;
}
//#endregion
//#region vendor/workflow-engine/index.ts
/**
* Worker-thread workflow engine. Each run executes its model-written script in
* an escapable vm context on a fresh worker and bridges `agent()` calls to host
* subagents. The thread prevents synchronous script work from blocking the host
* and permits forced termination, but it is containment rather than a security boundary.
* @module @deepseek-ai/dsh-workflow-worker-thread
*/
/** A body that still carries the Claude Code-style meta header (meta rides the seam as data here). */
const META_STATEMENT = /^\s*export\s+const\s+meta\b/;
/**
* Parse-check the body with the SAME wrapper the worker-side runtime
* compiles, so `start()` keeps the seam's synchronous `SCRIPT_PARSE` throw
* (the worker's own compile happens a thread away, after `start()` returned).
* One redundant parse per run, bought deliberately for the contract. A body
* opening with `export const meta` gets a pointed message instead of the
* wrapper's bare SyntaxError — the model's likeliest authoring slip.
*/
function assertBodyParses(body, name) {
	if (META_STATEMENT.test(body)) throw new WorkflowError$1("workflow meta rides the `meta` request field, not the script: remove the `export const meta = {...}` statement from the body", "SCRIPT_PARSE");
	try {
		new vm.Script(`(async () => {\n${body}\n})()`, {
			filename: `workflow:${name}`,
			lineOffset: -1
		});
	} catch (error) {
		throw new WorkflowError$1(`workflow script does not parse: ${String(error)}`, "SCRIPT_PARSE", { cause: error });
	}
}
/** Resolve one run's provider route before publishing work. */
function resolveSubagentProvider(ctx, configured, override) {
	const provider = override ?? configured;
	if (provider.length === 0 || provider !== provider.trim()) throw new WorkflowError$1("workflow subagentProvider must be a non-empty normalized string", "INVALID_ARGUMENT");
	if (ctx.subagents.getProvider(provider) === void 0) throw new WorkflowError$1(`no subagent provider registered for "${provider}"`, "AGENT_START");
	return provider;
}
/** Resolve one run's total-child cap against the engine deployment ceiling. */
function resolveMaxTotalAgents(requested, ceiling) {
	if (requested === void 0) return ceiling;
	if (!Number.isSafeInteger(requested) || requested < 1) throw new WorkflowError$1("workflow maxTotalAgents must be a positive safe integer", "INVALID_ARGUMENT");
	if (requested > ceiling) throw new WorkflowError$1(`workflow maxTotalAgents ${requested} exceeds the engine ceiling ${ceiling}`, "INVALID_ARGUMENT");
	return requested;
}
/** Validate cumulative spend supplied by a logical-run supervisor. */
function resolveInitialAgentSpend(requested, total, journal) {
	const committed = journal?.filter((entry) => entry.kind === "agent").length ?? 0;
	const resolved = requested ?? committed;
	if (!Number.isSafeInteger(resolved) || resolved < committed || resolved > total) throw new WorkflowError$1(`workflow initialAgentSpend must be a safe integer between the committed journal count (${committed}) and maxTotalAgents (${total})`, "INVALID_ARGUMENT");
	return resolved;
}
/** Validate the monotonic member sequence seed supplied by a logical-run supervisor. */
function resolveInitialAgentSeq(requested, spend, total, journal) {
	let journalMaximum = 0;
	for (const entry of journal ?? []) {
		if (entry.kind !== "agent") continue;
		journalMaximum = Math.max(journalMaximum, entry.seq);
	}
	const minimum = Math.max(spend, journalMaximum);
	const resolved = requested ?? minimum;
	if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > Number.MAX_SAFE_INTEGER - (total - spend)) throw new WorkflowError$1(`workflow initialAgentSeq must be a safe integer no less than prior spend or journal sequence (${minimum}) with room for the remaining logical-agent budget`, "INVALID_ARGUMENT");
	return resolved;
}
/** Snapshot and validate replay data before it crosses into workerData. */
function resolveJournal(journal) {
	if (journal === void 0) return void 0;
	let snapshot;
	try {
		snapshot = snapshotJsonValue(journal);
	} catch (error) {
		throw new WorkflowError$1("workflow journal must be lossless JSON data", "JOURNAL_DIVERGENCE", { cause: error });
	}
	if (snapshot === void 0 || !Array.isArray(snapshot)) throw new WorkflowError$1("workflow journal must be lossless JSON data", "JOURNAL_DIVERGENCE");
	const entries = snapshot;
	const callIds = /* @__PURE__ */ new Set();
	const agentSeqs = /* @__PURE__ */ new Set();
	let priorOrdinal = 0;
	for (const candidate of entries) {
		if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw new WorkflowError$1("workflow journal entries must be objects", "JOURNAL_DIVERGENCE");
		const entry = candidate;
		const ordinal = entry.ordinal;
		if (typeof ordinal !== "number" || !Number.isSafeInteger(ordinal) || ordinal !== priorOrdinal + 1) throw new WorkflowError$1("workflow journal entry ordinal must be the next positive safe integer", "JOURNAL_DIVERGENCE");
		priorOrdinal = ordinal;
		const callId = entry.callId;
		const callKey = Array.isArray(callId) ? callId.join(".") : "";
		if (!Array.isArray(callId) || callId.length === 0 || callId.some((part) => !Number.isSafeInteger(part) || part <= 0) || callIds.has(callKey)) throw new WorkflowError$1("workflow journal call identities must be non-empty and unique", "JOURNAL_DIVERGENCE");
		callIds.add(callKey);
		const fingerprint = entry.fingerprint;
		if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(fingerprint)) throw new WorkflowError$1("workflow journal fingerprint must be a lowercase SHA-256 digest", "JOURNAL_DIVERGENCE");
		switch (entry.kind) {
			case "agent":
				if (Object.keys(entry).some((key) => ![
					"kind",
					"ordinal",
					"callId",
					"fingerprint",
					"seq",
					"result"
				].includes(key)) || !Object.hasOwn(entry, "result")) throw new WorkflowError$1("workflow agent journal fields are not recognized", "JOURNAL_DIVERGENCE");
				if (typeof entry.seq !== "number" || !Number.isSafeInteger(entry.seq) || entry.seq < 1) throw new WorkflowError$1("workflow journal agent seq must be a positive safe integer", "JOURNAL_DIVERGENCE");
				if (agentSeqs.has(entry.seq)) throw new WorkflowError$1(`workflow journal repeats agent sequence ${entry.seq}`, "JOURNAL_DIVERGENCE");
				agentSeqs.add(entry.seq);
				break;
			case "phase":
				if (Object.keys(entry).some((key) => ![
					"kind",
					"ordinal",
					"callId",
					"fingerprint",
					"title"
				].includes(key))) throw new WorkflowError$1("workflow phase journal fields are not recognized", "JOURNAL_DIVERGENCE");
				if (typeof entry.title !== "string" || entry.title.length === 0) throw new WorkflowError$1("workflow phase journal title must be a non-empty string", "JOURNAL_DIVERGENCE");
				break;
			case "log":
				if (Object.keys(entry).some((key) => ![
					"kind",
					"ordinal",
					"callId",
					"fingerprint",
					"message"
				].includes(key))) throw new WorkflowError$1("workflow log journal fields are not recognized", "JOURNAL_DIVERGENCE");
				if (typeof entry.message !== "string") throw new WorkflowError$1("workflow log journal message must be a string", "JOURNAL_DIVERGENCE");
				break;
			case "scratch-read":
				if (Object.keys(entry).some((key) => ![
					"kind",
					"ordinal",
					"callId",
					"fingerprint",
					"content"
				].includes(key))) throw new WorkflowError$1("workflow scratch-read journal fields are not recognized", "JOURNAL_DIVERGENCE");
				if (entry.content !== void 0 && typeof entry.content !== "string") throw new WorkflowError$1("workflow scratch-read journal content must be a string", "JOURNAL_DIVERGENCE");
				break;
			case "scratch-write":
			case "await-user":
				if (Object.keys(entry).some((key) => ![
					"kind",
					"ordinal",
					"callId",
					"fingerprint"
				].includes(key))) throw new WorkflowError$1(`workflow ${entry.kind} journal fields are not recognized`, "JOURNAL_DIVERGENCE");
				break;
			default: throw new WorkflowError$1("workflow journal entry kind is not recognized", "JOURNAL_DIVERGENCE");
		}
	}
	return entries;
}
/**
* The worker-thread engine service. `start()` validates the script up front
* (meta + a host-side body parse) and returns a {@link WorkflowRun} whose
* `result` never rejects; the `workflow/*` events fire around the run per
* the seam contract.
*/
var WorkerThreadWorkflowEngine = class {
	static {
		this.inject = ["subagents"];
	}
	static {
		this.Config = z.object({
			provider: z.string().default("spawn"),
			maxConcurrentAgents: z.natural().default(0),
			maxTotalAgents: z.natural().min(1).default(1024),
			maxItemsPerCall: z.natural().min(1).default(4096),
			syncTimeoutMs: z.natural().min(1).default(5e3),
			disposeGraceMs: z.natural().default(5e3),
			maxProtocolMessageBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8388608),
			maxJournalBytes: z.number().step(1).min(2).max(Number.MAX_SAFE_INTEGER).default(67108864),
			maxChildPromptBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1048576),
			maxEventTextBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(65536),
			scratchMaxOperations: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4096),
			scratchMaxPendingOperations: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(64),
			scratchMaxFiles: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(64),
			scratchMaxFileBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1048576),
			scratchMaxTotalBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(8388608)
		});
	}
	constructor(ctx, config = {}) {
		this.ctx = ctx;
		this.dshWorkflowsNative = true;
		this.config = {
			provider: config.provider ?? "spawn",
			maxConcurrentAgents: config.maxConcurrentAgents ?? 0,
			maxTotalAgents: config.maxTotalAgents ?? 1024,
			maxItemsPerCall: config.maxItemsPerCall ?? 4096,
			syncTimeoutMs: config.syncTimeoutMs ?? 5e3,
			disposeGraceMs: config.disposeGraceMs ?? 5e3,
			maxProtocolMessageBytes: config.maxProtocolMessageBytes ?? 8388608,
			maxJournalBytes: config.maxJournalBytes ?? 67108864,
			maxChildPromptBytes: config.maxChildPromptBytes ?? 1048576,
			maxEventTextBytes: config.maxEventTextBytes ?? 65536,
			scratchMaxOperations: config.scratchMaxOperations ?? 4096,
			scratchMaxPendingOperations: config.scratchMaxPendingOperations ?? 64,
			scratchMaxFiles: config.scratchMaxFiles ?? 64,
			scratchMaxFileBytes: config.scratchMaxFileBytes ?? 1048576,
			scratchMaxTotalBytes: config.scratchMaxTotalBytes ?? 8388608,
			validationTimeoutMs: config.validationTimeoutMs ?? 1e4
		};
		if (this.config.scratchMaxFileBytes > this.config.scratchMaxTotalBytes) throw new WorkflowError$1("workflow scratchMaxFileBytes cannot exceed scratchMaxTotalBytes", "INVALID_ARGUMENT");
		if (this.config.scratchMaxPendingOperations > this.config.scratchMaxOperations) throw new WorkflowError$1("workflow scratchMaxPendingOperations cannot exceed scratchMaxOperations", "INVALID_ARGUMENT");
	}
	/** Dispatch through the host event registry without registering a global service. */
	emitWorkflowEvent(name, ...args) {
		const dispatch = this.ctx?.events?.dispatch;
		if (typeof dispatch !== "function") return;
		for (const callback of dispatch.call(this.ctx.events, "emit", [name, ...args]) ?? []) try {
			Promise.resolve(callback(...args)).catch((error) => this.ctx?.logger?.warn?.(`workflow: ${name} listener rejected`, error));
		} catch (error) {
			this.ctx?.logger?.warn?.(`workflow: ${name} listener threw`, error);
		}
	}
	/** Side-effect-free smoke validation through the same worker runtime. */
	async validate(request) {
		const timeout = new AbortController();
		const timer = setTimeout(() => timeout.abort(/* @__PURE__ */ new Error("workflow validation timed out")), this.config.validationTimeoutMs);
		timer.unref();
		const callerSignal = request.signal;
		const signal = callerSignal === void 0 ? timeout.signal : AbortSignal.any([callerSignal, timeout.signal]);
		const files = /* @__PURE__ */ new Map();
		let operations = 0;
		let pending = 0;
		const bytes = (value) => Buffer.byteLength(value, "utf8");
		const begin = () => {
			operations += 1;
			pending += 1;
			if (operations > this.config.scratchMaxOperations) throw new RangeError("workflow scratch operation limit exceeded");
			if (pending > this.config.scratchMaxPendingOperations) throw new RangeError("workflow scratch pending-operation limit exceeded");
		};
		const scratch = {
			read: async (name) => {
				begin();
				try {
					return files.get(name);
				} finally {
					pending -= 1;
				}
			},
			write: async (name, content) => {
				begin();
				try {
					const size = bytes(content);
					if (size > this.config.scratchMaxFileBytes) throw new RangeError("workflow scratch file limit exceeded");
					if (!files.has(name) && files.size >= this.config.scratchMaxFiles) throw new RangeError("workflow scratch file-count limit exceeded");
					let total = size;
					for (const [other, value] of files) if (other !== name) total += bytes(value);
					if (total > this.config.scratchMaxTotalBytes) throw new RangeError("workflow scratch total-byte limit exceeded");
					files.set(name, content);
				} finally {
					pending -= 1;
				}
			}
		};
		const run = this.start({
			...request,
			signal,
			scratch,
			validateOnly: true,
			deferStart: true
		});
		let result;
		try {
			run.release();
			result = await run.result;
			if (callerSignal?.aborted) throw callerSignal.reason ?? new DOMException("This operation was aborted", "AbortError");
		} finally {
			clearTimeout(timer);
			run.cancel("workflow validation finished");
			await run.dispose();
		}
		if (result.stopReason !== "completed") return {
			ok: false,
			status: "error",
			error: result.error ?? "workflow validation failed",
			errorCode: result.errorCode
		};
		if (typeof result.value === "string" && /^would (?:pause|await_user)\b/u.test(result.value)) return {
			ok: true,
			status: "would-pause",
			value: result.value
		};
		return {
			ok: true,
			status: "completed",
			value: result.value
		};
	}
	/**
	* Validate and execute a workflow script in a fresh worker thread. Throws
	* {@link WorkflowError} synchronously (`META_INVALID` for a malformed meta
	* block, `SCRIPT_PARSE` for a body that does not compile) for a request
	* that cannot begin; once a run is returned, every failure resolves through
	* `result.stopReason` instead.
	* @param request - the script body, its meta data and `args`, the parent
	*   agent, and an optional cancel signal.
	* @returns the live run (its `result` resolves when the script settles).
	*/
	start(request) {
		const meta = validateMeta(request.meta);
		assertBodyParses(request.script, meta.name);
		const args = request.args === void 0 ? void 0 : snapshotJsonValue(request.args);
		if (request.args !== void 0 && args === void 0) throw new WorkflowError$1("workflow args must be losslessly JSON-serializable data", "INVALID_ARGUMENT");
		const checkpoint = request.replay?.checkpoint;
		const journal = resolveJournal(request.journal ?? checkpoint?.journal);
		const subagentProvider = resolveSubagentProvider(this.ctx, this.config.provider, request.subagentProvider);
		const maxTotalAgents = resolveMaxTotalAgents(request.maxTotalAgents, this.config.maxTotalAgents);
		const initialAgentSpend = resolveInitialAgentSpend(request.initialAgentSpend ?? checkpoint?.agentSpend, maxTotalAgents, journal);
		const initialAgentSeq = resolveInitialAgentSeq(request.initialAgentSeq ?? checkpoint?.agentSeq, initialAgentSpend, maxTotalAgents, journal);
		const id = WorkflowRunId(typeof request.runId === "string" ? request.runId : randomUUID());
		const info = {
			id,
			meta
		};
		const limits = {
			maxConcurrentAgents: this.config.maxConcurrentAgents === 0 ? Math.min(16, Math.max(1, availableParallelism() - 2)) : this.config.maxConcurrentAgents,
			maxTotalAgents,
			maxItemsPerCall: this.config.maxItemsPerCall,
			syncTimeoutMs: this.config.syncTimeoutMs
		};
		const init = {
			meta,
			body: request.script,
			...args !== void 0 ? { args } : {},
			...journal !== void 0 ? { journal } : {},
			initialAgentSpend,
			initialAgentSeq,
			...request.validateOnly !== void 0 ? { validateOnly: request.validateOnly } : {},
			limits
		};
		const runCtx = this.ctx;
		const subagents = runCtx.subagents;
		const workerRun = new WorkerRun(runCtx, subagents, id, meta, request.parent, init, subagentProvider, this.config.disposeGraceMs, {
			phase: (title) => {
				this.emitWorkflowEvent("workflow/phase", info, title);
			},
			log: (message) => {
				this.emitWorkflowEvent("workflow/log", info, message);
			},
			agentStart: (agent) => {
				this.emitWorkflowEvent("workflow/agent-start", info, agent);
			},
			agentEnd: (agent) => {
				this.emitWorkflowEvent("workflow/agent-end", info, agent);
			},
			gate: (gate) => {
				this.emitWorkflowEvent("workflow/gate", info, gate);
			},
			journalCommit: (entry) => {
				this.emitWorkflowEvent("workflow/journal-commit", info, entry);
			}
		}, request.signal, request.scratchDir, {
			maxProtocolMessageBytes: this.config.maxProtocolMessageBytes,
			maxJournalBytes: this.config.maxJournalBytes,
			maxChildPromptBytes: this.config.maxChildPromptBytes,
			maxEventTextBytes: this.config.maxEventTextBytes,
			scratch: {
				maxOperations: this.config.scratchMaxOperations,
				maxPendingOperations: this.config.scratchMaxPendingOperations,
				maxFiles: this.config.scratchMaxFiles,
				maxFileBytes: this.config.scratchMaxFileBytes,
				maxTotalBytes: this.config.scratchMaxTotalBytes
			}
		}, request.deferStart === true, request.scratch);
		this.emitWorkflowEvent("workflow/start", info);
		workerRun.result.then((settled) => {
			this.emitWorkflowEvent("workflow/end", info, {
				stopReason: settled.stopReason,
				...settled.error !== void 0 ? { error: settled.error } : {},
				...settled.errorCode !== void 0 ? { errorCode: settled.errorCode } : {},
				agentsStarted: settled.agentsStarted
			});
		});
		return workerRun;
	}
};
//#endregion
export { MaterializeError, WorkerThreadWorkflowEngine as default, materializeFromRealm, validateMeta };

//# sourceMappingURL=index.js.map