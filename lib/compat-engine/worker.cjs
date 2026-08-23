//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let node_worker_threads = require("node:worker_threads");
let _deepseek_ai_dsh_workflow = require("@deepseek-ai/dsh-workflow");
let _deepseek_ai_dsh_llm = require("@deepseek-ai/dsh-llm");
let _deepseek_ai_dsh_session = require("@deepseek-ai/dsh-session");
let _deepseek_ai_dsh_tools = require("@deepseek-ai/dsh-tools");
let node_async_hooks = require("node:async_hooks");
let node_crypto = require("node:crypto");
let node_vm = require("node:vm");
node_vm = __toESM(node_vm, 1);
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
//#region vendor/workflow-engine/compat-seam.ts
/** Local extensions deliberately absent from the official 0.1.1-rc.2 seam. */
const WorkflowError$1 = _deepseek_ai_dsh_workflow.WorkflowError;
//#endregion
//#region vendor/workflow-engine/runtime.ts
/**
* Per-run worker-side vm hooks, child RPC, concurrency/caps, cancellation, and result serialization; it
* never touches Cordis. Script values leaving the realm are materialized as plain JSON before
* messaging. Values entering the trusted model-written realm are passed directly; `args` alone is
* cloned so script mutation cannot alter initialization data. See `./realm.ts` for the trust model.
*
* Fatal workflow errors—bad hook arguments, unsupported schemas/options, caps, start failures, and
* cancellation—propagate through combinators. Only child failures and ordinary stage errors become
* per-item nulls. Every returned promise has a rejection consumer so dropped script promises cannot
* kill the worker. A cancelled script that never settles emits nothing; the host force-settles the
* run within grace and terminates the thread.
* @module @deepseek-ai/dsh-workflow-worker-thread/runtime
*/
/**
* Build a callable/constructable global that fails before exposing ambient
* process state. The vm is not a security boundary, but ordinary authored
* workflows must not accidentally make resumed control flow depend on the
* clock, randomness, garbage collection, or timer-like atomics.
*/
function unavailableNondeterministicGlobal(name) {
	const fail = () => {
		throw new WorkflowError$1(`${name} is unavailable in workflow scripts because runs must derive control flow from args and committed host results`, "INVALID_ARGUMENT");
	};
	/* v8 ignore next -- every call/construct/property operation is intercepted by the Proxy traps below */
	const target = Object.freeze(function unavailableWorkflowGlobal() {
		return fail();
	});
	return Object.freeze(new Proxy(target, {
		apply: fail,
		construct: fail,
		get: fail,
		set: fail
	}));
}
/** Clone the deterministic Math surface while replacing its random source. */
function deterministicMath() {
	const descriptors = Object.getOwnPropertyDescriptors(Math);
	descriptors.random = {
		...descriptors.random,
		value: Object.freeze(() => {
			throw new WorkflowError$1("Math.random() is unavailable in workflow scripts because runs must derive control flow from args and committed host results", "INVALID_ARGUMENT");
		})
	};
	return Object.freeze(Object.defineProperties(Object.create(Reflect.getPrototypeOf(Math)), descriptors));
}
/** Define one JSON object key without giving `__proto__` assignment semantics. */
function defineJsonProperty(target, key, value) {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value
	});
}
/** Copy one generated JSON object while retaining every key as data. */
function copyJsonObject(source) {
	const copy = {};
	for (const [key, value] of Object.entries(source)) defineJsonProperty(copy, key, value);
	return copy;
}
/** Define a schema key without giving `__proto__` assignment semantics. */
function defineSchemaProperty(target, key, value) {
	Object.defineProperty(target, key, {
		configurable: true,
		enumerable: true,
		writable: true,
		value
	});
}
/** Whether a bound is a lossless, non-negative safe integer (including rejecting `-0`). */
function isArrayBound(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}
/**
* Validate the plugin's two forward-compatible schema keywords and produce
* the projection accepted by stock RC2. Traversal follows schema-bearing
* locations only: annotation payloads are data and must not be rewritten.
*/
function prepareObjectSchema(authored) {
	const boundViolations = [];
	const visit = (rawNode, path) => {
		if (typeof rawNode !== "object" || rawNode === null || Array.isArray(rawNode)) return rawNode;
		const node = rawNode;
		const provider = {};
		const hasMin = Object.hasOwn(node, "minItems");
		const hasMax = Object.hasOwn(node, "maxItems");
		const hasOneOf = Object.hasOwn(node, "oneOf");
		for (const keyword of ["minItems", "maxItems"]) {
			if (!Object.hasOwn(node, keyword)) continue;
			if (hasOneOf) boundViolations.push(`${path}.${keyword} is not supported beside oneOf`);
			else if (node.type !== "array") boundViolations.push(Object.hasOwn(node, "type") ? `${path}.${keyword} is not supported on type ${JSON.stringify(node.type)}` : `${path}.${keyword} requires type or oneOf`);
		}
		let minimum;
		let maximum;
		if (!hasOneOf && node.type === "array") {
			if (hasMin) {
				if (!isArrayBound(node.minItems)) boundViolations.push(`${path}.minItems must be a non-negative safe integer`);
				else minimum = node.minItems;
			}
			if (hasMax) {
				if (!isArrayBound(node.maxItems)) boundViolations.push(`${path}.maxItems must be a non-negative safe integer`);
				else maximum = node.maxItems;
			}
			if (minimum !== void 0 && maximum !== void 0 && minimum > maximum) boundViolations.push(`${path}.minItems must not exceed ${path}.maxItems`);
		}
		for (const [key, value] of Object.entries(node)) {
			if (key === "minItems" || key === "maxItems") continue;
			if (key === "items") {
				defineSchemaProperty(provider, key, visit(value, `${path}.items`));
				continue;
			}
			if (key === "oneOf" && Array.isArray(value)) {
				defineSchemaProperty(provider, key, value.map((branch, index) => visit(branch, `${path}.oneOf[${index}]`)));
				continue;
			}
			if (key === "properties" && typeof value === "object" && value !== null && !Array.isArray(value)) {
				const properties = {};
				for (const [name, child] of Object.entries(value)) defineSchemaProperty(properties, name, visit(child, `${path}.properties.${name}`));
				defineSchemaProperty(provider, key, properties);
				continue;
			}
			defineSchemaProperty(provider, key, value);
		}
		return provider;
	};
	const provider = visit(authored, "schema");
	let stockViolations = [];
	try {
		(0, _deepseek_ai_dsh_tools.assertObjectJsonSchema)(provider);
	} catch (error) {
		/* v8 ignore next -- assertObjectJsonSchema only throws JsonSchemaError */
		if (!(error instanceof _deepseek_ai_dsh_tools.JsonSchemaError)) throw error;
		stockViolations = error.violations;
	}
	const violations = [...boundViolations, ...stockViolations];
	if (violations.length > 0) throw new _deepseek_ai_dsh_tools.JsonSchemaError(violations);
	return {
		authored,
		provider
	};
}
/**
* Validate against the authored extended subset while continuing to delegate
* all ordinary JSON/type/scalar checks to RC2's shared validator. Object and
* array children are walked here so bounds can participate in exact-one
* `oneOf` matching instead of the stripped provider branches becoming
* spuriously overlapping.
*/
function schemaValueMatches(schema, value) {
	if (schema.oneOf !== void 0) {
		let matches = 0;
		for (const branch of schema.oneOf) {
			if (schemaValueMatches(branch, value)) matches += 1;
			if (matches > 1) return false;
		}
		return matches === 1;
	}
	if (schema.type === "object") {
		if ((0, _deepseek_ai_dsh_tools.validateJsonSchemaValue)({ type: "object" }, value).length > 0) return false;
		const record = value;
		const properties = schema.properties ?? {};
		for (const required of schema.required ?? []) if (!Object.hasOwn(record, required)) return false;
		if (schema.additionalProperties === false) {
			for (const key of Object.keys(record)) if (!Object.hasOwn(properties, key)) return false;
		}
		for (const [key, childSchema] of Object.entries(properties)) if (Object.hasOwn(record, key) && !schemaValueMatches(childSchema, record[key])) return false;
		return true;
	}
	if (schema.type === "array") {
		if ((0, _deepseek_ai_dsh_tools.validateJsonSchemaValue)({ type: "array" }, value).length > 0) return false;
		const array = value;
		const bounded = schema;
		if (bounded.minItems !== void 0 && array.length < bounded.minItems) return false;
		if (bounded.maxItems !== void 0 && array.length > bounded.maxItems) return false;
		if (schema.items !== void 0) {
			for (const item of array) if (!schemaValueMatches(schema.items, item)) return false;
		}
		return true;
	}
	return (0, _deepseek_ai_dsh_tools.validateJsonSchemaValue)(schema, value).length === 0;
}
/** Deterministic unconstrained candidates used to disambiguate exact-one unions. */
const ANY_JSON_CANDIDATES = [
	null,
	false,
	true,
	0,
	.5,
	"",
	"value",
	[],
	{}
];
/** Count serialized JSON nodes up to a configured smoke-host work limit. */
function jsonNodeCount(value, limit) {
	let count = 0;
	const pending = [value];
	for (let current = pending.pop(); current !== void 0; current = pending.pop()) {
		count += 1;
		if (count > limit) return count;
		if (Array.isArray(current)) for (const child of current) pending.push(child);
		else if (typeof current === "object" && current !== null) for (const child of Object.values(current)) pending.push(child);
	}
	return count;
}
/**
* Produce deterministic candidates for one already-validated schema node.
* Returned candidates satisfy the node; an empty list means the supported
* exact-one vocabulary has no value this smoke host can construct.
*/
function cannedSchemaCandidates(schema, maxArrayItems) {
	let candidates;
	if (schema.oneOf !== void 0) {
		candidates = [];
		for (const branch of schema.oneOf) {
			for (const candidate of cannedSchemaCandidates(branch, maxArrayItems)) {
				if (candidates.length >= maxArrayItems) break;
				candidates.push(candidate);
			}
			if (candidates.length >= maxArrayItems) break;
		}
		for (const candidate of ANY_JSON_CANDIDATES) {
			if (candidates.length >= maxArrayItems) break;
			candidates.push(candidate);
		}
	} else if (Object.hasOwn(schema, "const")) candidates = [schema.const];
	else if (schema.enum !== void 0) candidates = [...schema.enum];
	else switch (schema.type) {
		case "object": {
			const properties = schema.properties ?? {};
			const required = schema.required ?? [];
			const base = {};
			const requiredCandidates = /* @__PURE__ */ new Map();
			for (const key of required) {
				const values = cannedSchemaCandidates(properties[key], maxArrayItems);
				if (values.length === 0) return [];
				requiredCandidates.set(key, values);
				defineJsonProperty(base, key, values[0]);
			}
			candidates = [base];
			for (const [key, values] of requiredCandidates) for (const value of values.slice(1)) {
				if (candidates.length >= maxArrayItems) break;
				const alternate = copyJsonObject(base);
				defineJsonProperty(alternate, key, value);
				candidates.push(alternate);
			}
			const optional = Object.entries(properties).filter(([key]) => !requiredCandidates.has(key));
			const withAllOptional = copyJsonObject(base);
			let hasAllOptional = false;
			for (const [key, childSchema] of optional) {
				const values = cannedSchemaCandidates(childSchema, maxArrayItems);
				for (const value of values) {
					if (candidates.length >= maxArrayItems) break;
					const alternate = copyJsonObject(base);
					defineJsonProperty(alternate, key, value);
					candidates.push(alternate);
				}
				if (values[0] !== void 0) {
					defineJsonProperty(withAllOptional, key, values[0]);
					hasAllOptional = true;
				}
			}
			if (hasAllOptional) candidates.push(withAllOptional);
			break;
		}
		case "array": {
			const arraySchema = schema;
			const minimum = arraySchema.minItems ?? 0;
			if (minimum > maxArrayItems) return [];
			const mayContainItem = arraySchema.maxItems === void 0 || arraySchema.maxItems > 0;
			const itemCandidates = schema.items === void 0 ? [null] : cannedSchemaCandidates(schema.items, maxArrayItems);
			candidates = minimum === 0 ? [[]] : [];
			for (const value of itemCandidates) if (minimum > 0 && 1 + minimum * jsonNodeCount(value, maxArrayItems) <= maxArrayItems) candidates.push(Array.from({ length: minimum }, () => value));
			else if (mayContainItem) candidates.push([value]);
			break;
		}
		case "string":
			candidates = ["", "value"];
			break;
		case "number":
			candidates = [
				0,
				.5,
				1,
				-1
			];
			break;
		case "integer":
			candidates = [
				0,
				1,
				-1
			];
			break;
		case "boolean":
			candidates = [false, true];
			break;
		case "null":
			candidates = [null];
			break;
		case void 0:
			candidates = [...ANY_JSON_CANDIDATES];
			break;
		/* v8 ignore next -- assertObjectJsonSchema validated the closed schema vocabulary recursively. */
		default: return [];
	}
	return candidates.filter((candidate) => jsonNodeCount(candidate, maxArrayItems) <= maxArrayItems).filter((candidate) => schemaValueMatches(schema, candidate)).slice(0, maxArrayItems);
}
/** Synthesize one schema-conforming structured result for `validate_only`. */
function cannedSchemaValue(schema, maxArrayItems) {
	const candidate = cannedSchemaCandidates(schema, maxArrayItems)[0];
	if (candidate !== void 0) return candidate;
	throw new WorkflowError$1("validate_only could not synthesize a canned result that conforms to the agent() schema", "UNSUPPORTED_SCHEMA");
}
/** The `agent()` options the script may pass; everything else rejects loud. */
const SUPPORTED_AGENT_OPTIONS = /* @__PURE__ */ new Set([
	"label",
	"phase",
	"schema",
	"provider",
	"model"
]);
/** Deferred Claude Code options we name explicitly in the rejection message. */
const DEFERRED_AGENT_OPTIONS = /* @__PURE__ */ new Set([
	"effort",
	"isolation",
	"agentType"
]);
/** Flatten a child's final output blocks to text (the non-schema `agent()` result). */
function outputText(blocks) {
	return blocks.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/** A short display label derived from the prompt when the script passes none. */
function defaultLabel(prompt) {
	const newline = prompt.indexOf("\n");
	const line = newline === -1 ? prompt : prompt.slice(0, newline);
	return line.length <= 48 ? line : `${line.slice(0, 47)}…`;
}
/**
* One live script execution inside the worker. Constructed per run by the
* session; `drive()` is called exactly once and NEVER rejects — every failure
* becomes a {@link WorkflowResult} with a non-`completed` stop reason. The
* host owns cancellation and cleanup of any dropped child work.
*/
var WorkflowExecution = class {
	constructor(meta, body, args, limits, observer, children, journal, validateOnly = false, initialAgentSpend = 0, initialAgentSeq = initialAgentSpend) {
		this.limits = limits;
		this.observer = observer;
		this.children = children;
		this.validateOnly = validateOnly;
		this.activeSlots = 0;
		this.slotWaiters = [];
		this.completionGate = Promise.withResolvers();
		this.replayedJournalCallIds = /* @__PURE__ */ new Set();
		this.callScopes = new node_async_hooks.AsyncLocalStorage();
		this.rootScope = {
			path: [],
			nextNode: 0
		};
		try {
			this.compiled = new node_vm.Script(`(async () => {\n${body}\n})()`, {
				filename: `workflow:${meta.name}`,
				lineOffset: -1
			});
		} catch (error) {
			throw new WorkflowError$1(`workflow script does not parse: ${String(error)}`, "SCRIPT_PARSE", { cause: error });
		}
		const committedAgents = (journal ?? []).filter((entry) => entry.kind === "agent");
		this.started = Math.max(initialAgentSpend, committedAgents.length);
		let journalMaximum = 0;
		let ordinalMaximum = 0;
		for (const entry of committedAgents) journalMaximum = Math.max(journalMaximum, entry.seq);
		for (const entry of journal ?? []) ordinalMaximum = Math.max(ordinalMaximum, entry.ordinal);
		this.nextAgentSeq = Math.max(initialAgentSeq, this.started, journalMaximum);
		this.nextJournalOrdinal = ordinalMaximum;
		this.journal = indexJournal(journal);
		this.context = node_vm.createContext({}, { name: `workflow:${meta.name}` });
		const globals = {
			agent: (prompt, opts) => this.contain(this.agent(prompt, opts)),
			parallel: (items) => this.contain(this.parallel(items)),
			pipeline: (items, ...stages) => this.contain(this.pipeline(items, stages)),
			phase: (title) => {
				this.phase(title);
			},
			log: (message) => {
				this.log(message);
			},
			complete: (value) => {
				this.complete(value);
			},
			pause: (kind, message) => this.contain(this.gate(kind, message, false)),
			await_user: (kind, message) => this.contain(this.gate(kind, message, true)),
			budget: () => this.budget(),
			write_scratch_file: (name, content) => this.contain(this.writeScratch(name, content)),
			read_scratch_file: (name) => this.contain(this.readScratch(name)),
			Date: unavailableNondeterministicGlobal("Date"),
			Math: deterministicMath(),
			Atomics: unavailableNondeterministicGlobal("Atomics"),
			SharedArrayBuffer: unavailableNondeterministicGlobal("SharedArrayBuffer"),
			WeakRef: unavailableNondeterministicGlobal("WeakRef"),
			FinalizationRegistry: unavailableNondeterministicGlobal("FinalizationRegistry"),
			args
		};
		for (const [key, value] of Object.entries(globals)) this.context[key] = typeof value === "function" ? Object.freeze(value) : value;
	}
	/** Release the gate the script is parked on, if any. */
	resume() {
		this.gateResume?.();
	}
	/**
	* Whether the run has been cancelled. A METHOD, not an inline property
	* read: `cancel()` mutates `cancelReason` concurrently (the session's
	* message handler), and an inline read after an `await` gets narrowed by
	* control flow into an always-false comparison.
	*/
	isCancelled() {
		return this.cancelReason !== void 0;
	}
	/**
	* Shared hook entry guard: after {@link cancel}, EVERY hook throws
	* `CANCELLED` at its next call — cancellation is the next HOOK boundary,
	* not just the next `agent()`, so a script that caught one cancelled
	* rejection cannot keep emitting progress through `phase`/`log` or enter a
	* combinator.
	*/
	throwIfCancelled() {
		if (this.completed !== void 0 || this.completionError !== void 0) throw COMPLETE_SENTINEL;
		if (this.isCancelled()) throw this.cancelledError();
	}
	/**
	* Cancel the run: waiting `agent()` slots reject and every future hook call
	* throws `CANCELLED` — the script dies at its next await. A script that
	* never settles anyway (parked on a promise no hook owns) is the HOST's
	* problem: its grace timer force-settles the run and terminates the
	* worker. Idempotent; the first reason wins.
	* @param reason - human-readable cause carried on the CANCELLED error. The
	* host independently aborts the required signal shared by every child.
	*/
	cancel(reason) {
		if (this.cancelReason !== void 0) return;
		this.cancelReason = reason;
		this.cancelError = new WorkflowError$1(`workflow run cancelled: ${this.cancelReason}`, "CANCELLED");
		for (const waiter of this.slotWaiters.splice(0)) waiter.reject(this.cancelledError());
		this.gateResume?.();
	}
	/**
	* Run the script to settlement. Resolves — never rejects — with the run's
	* {@link WorkflowResult}: the materialized return value on `completed`, the
	* failure message on `error`, and `cancelled` when the script died of
	* cancellation. This method only chooses the result; the session publishes
	* it and the host owns terminal child cancellation.
	* @returns the settled outcome — this promise NEVER rejects (the seam's
	* `result`-never-rejects contract); every failure maps to a variant.
	*/
	async drive() {
		try {
			if (this.isCancelled()) throw this.cancelledError();
			const scriptPromise = this.callScopes.run(this.rootScope, () => this.compiled.runInContext(this.context, { timeout: this.limits.syncTimeoutMs }));
			const scriptResult = this.contain(Promise.resolve(scriptPromise)).then((value) => ({
				kind: "script",
				value
			}));
			const completed = this.completionGate.promise.then(() => ({ kind: "complete" }));
			const settled = await Promise.race([scriptResult, completed]);
			if (settled.kind === "complete") return this.completedResult();
			const raw = settled.value;
			/* v8 ignore next -- complete() resolves completionGate before a caught sentinel can settle scriptPromise */
			if (this.completed !== void 0 || this.completionError !== void 0) return this.completedResult();
			if (this.isCancelled()) throw this.cancelledError();
			const value = raw === void 0 ? null : this.materializeResult(raw);
			const missingReplay = this.unreplayedJournalError();
			if (missingReplay !== void 0) throw missingReplay;
			return {
				value,
				stopReason: "completed",
				agentsStarted: this.started
			};
		} catch (error) {
			/* v8 ignore next -- completionGate wins the race whenever complete() has claimed a terminal */
			if (this.completed !== void 0 || this.completionError !== void 0) return this.completedResult();
			if (this.isCancelled()) return {
				value: null,
				stopReason: "cancelled",
				error: this.cancelledError().message,
				errorCode: "CANCELLED",
				agentsStarted: this.started
			};
			/* v8 ignore next -- the out-of-band completionGate always wins before the sentinel reaches drive() */
			if (error === COMPLETE_SENTINEL) return this.completedResult();
			return {
				value: null,
				stopReason: "error",
				error: renderThrown(error),
				...error instanceof WorkflowError$1 ? { errorCode: error.code } : {},
				agentsStarted: this.started
			};
		}
	}
	/** Materialize and report the `complete(value)` terminal. */
	completedResult() {
		if (this.completionError !== void 0) return {
			value: null,
			stopReason: "error",
			error: this.completionError.message,
			errorCode: this.completionError.code,
			agentsStarted: this.started
		};
		const missingReplay = this.unreplayedJournalError();
		if (missingReplay !== void 0) return {
			value: null,
			stopReason: "error",
			error: missingReplay.message,
			errorCode: missingReplay.code,
			agentsStarted: this.started
		};
		return {
			value: this.completed.value,
			stopReason: "completed",
			agentsStarted: this.started
		};
	}
	/**
	* Attach a no-op rejection consumer WITHOUT changing what the caller
	* receives: if the script drops the promise (no await), cancellation cannot
	* become an unhandled rejection (which would kill the worker thread); if
	* the script does await it, it still observes the rejection.
	*/
	contain(promise) {
		promise.catch(() => {});
		return promise;
	}
	cancelledError() {
		/* v8 ignore next */
		return this.cancelError ?? new WorkflowError$1("workflow run cancelled", "CANCELLED");
	}
	/** Materialize the script's return value; violations become RESULT_UNSERIALIZABLE. */
	materializeResult(raw) {
		try {
			return materializeFromRealm(raw, "workflow result");
		} catch (error) {
			/* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
			if (!(error instanceof MaterializeError)) throw error;
			throw new WorkflowError$1(`the workflow's return value is not plain JSON data — ${error.message}. Return only JSON-serializable objects/arrays/scalars.`, "RESULT_UNSERIALIZABLE", { cause: error });
		}
	}
	/**
	* Acquire one concurrency slot (FIFO). Cancellation rejects QUEUED waiters
	* (see {@link cancel}); the callers guard their own entry and post-acquire
	* windows, so no cancelled-precheck is duplicated here.
	*/
	acquireSlot() {
		if (this.activeSlots < this.limits.maxConcurrentAgents) {
			this.activeSlots += 1;
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			this.slotWaiters.push({
				resolve: () => {
					this.activeSlots += 1;
					resolve();
				},
				reject
			});
		});
	}
	releaseSlot() {
		this.activeSlots -= 1;
		const next = this.slotWaiters.shift();
		if (next) next.resolve();
	}
	/** Claim the next deterministic node under the current combinator branch. */
	claimCallId(_kind) {
		const scope = this.currentScope();
		scope.nextNode += 1;
		return [...scope.path, scope.nextNode];
	}
	/** Resolve and verify one committed replay entry for the current call. */
	replayEntry(callId, kind, fingerprint) {
		const key = callId.join(".");
		const replay = this.journal.get(key);
		if (replay === void 0) return void 0;
		if (replay.kind !== kind || replay.fingerprint !== fingerprint) throw new WorkflowError$1(`workflow journal diverged at ${callId}: the replayed ${kind} request does not match the committed request`, "JOURNAL_DIVERGENCE");
		this.replayedJournalCallIds.add(key);
		return replay;
	}
	/** Detect a resumed path that skipped a previously committed host call. */
	unreplayedJournalError() {
		for (const callId of this.journal.keys()) if (!this.replayedJournalCallIds.has(callId)) return new WorkflowError$1(`workflow journal diverged: the resumed path did not replay committed call ${callId}`, "JOURNAL_DIVERGENCE");
	}
	/** Append one completed host call unless this is a non-persistent smoke check. */
	commitJournal(entry) {
		if (this.validateOnly) return;
		this.nextJournalOrdinal += 1;
		this.observer.journalCommit({
			...entry,
			ordinal: this.nextJournalOrdinal
		});
	}
	/** Atomically admit one direct-agent reservation for every new panel item. */
	reservePanel(scopes) {
		const reservations = scopes.flatMap((scope) => scope.reservation === void 0 ? [] : [scope.reservation]);
		if (this.started + reservations.length > this.limits.maxTotalAgents) throw this.agentCapError(reservations.length);
		this.started += reservations.length;
	}
	/** Consume a panel reservation or admit one standalone/nested agent call. */
	spendAgentBudget() {
		const reservation = this.callScopes.getStore()?.reservation;
		if (reservation !== void 0 && reservation.available) {
			reservation.available = false;
			this.nextAgentSeq += 1;
			return this.nextAgentSeq;
		}
		if (this.started >= this.limits.maxTotalAgents) throw this.agentCapError(1);
		this.started += 1;
		this.nextAgentSeq += 1;
		return this.nextAgentSeq;
	}
	/** Build the fatal error for a budget admission that would exceed the cap. */
	agentCapError(requested) {
		return new WorkflowError$1(`this run cannot admit ${requested} agent${requested === 1 ? "" : "s"}: ${this.started} of ${this.limits.maxTotalAgents} logical-agent budget is already spent and the total agent cap (${this.limits.maxTotalAgents}) would be exceeded — raise the applicable maxTotalAgents limit if the scale is intentional`, "AGENT_CAP");
	}
	/** The `agent(prompt, opts)` hook. */
	async agent(rawPrompt, rawOpts) {
		this.throwIfCancelled();
		if (typeof rawPrompt !== "string" || rawPrompt.length === 0) throw new WorkflowError$1("agent() requires a non-empty prompt string", "INVALID_ARGUMENT");
		const prepared = this.readAgentOptions(rawOpts);
		const opts = prepared.options;
		const label = opts.label ?? defaultLabel(rawPrompt);
		const phase = opts.phase ?? this.currentScope().currentPhase;
		const callId = this.claimCallId("agent");
		const fingerprint = fingerprintHostCall("agent", {
			prompt: rawPrompt,
			options: {
				...opts,
				label,
				...phase === void 0 ? {} : { phase }
			}
		});
		const replay = this.replayEntry(callId, "agent", fingerprint);
		if (replay !== void 0) return replay.result;
		const seq = this.spendAgentBudget();
		if (this.validateOnly) return opts.schema !== void 0 ? cannedSchemaValue(opts.schema, this.limits.maxItemsPerCall) : "";
		await this.acquireSlot();
		try {
			this.throwIfCancelled();
			let run;
			try {
				run = await this.children.startAgent({
					prompt: rawPrompt,
					...prepared.providerSchema !== void 0 ? { schema: prepared.providerSchema } : {},
					...opts.provider !== void 0 ? { provider: opts.provider } : {},
					...opts.model !== void 0 ? { model: opts.model } : {}
				});
			} catch (error) {
				if (this.isCancelled()) throw this.cancelledError();
				throw new WorkflowError$1(`agent() could not start a child: ${renderThrown(error)}`, "AGENT_START", { cause: error });
			}
			if (this.isCancelled()) {
				await run.dispose();
				throw this.cancelledError();
			}
			const info = {
				seq,
				label,
				...phase !== void 0 ? { phase } : {},
				childId: (0, _deepseek_ai_dsh_session.SessionId)(run.id)
			};
			this.observer.agentStart(info);
			try {
				let result;
				try {
					result = await run.result;
				} catch (error) {
					if (this.isCancelled()) {
						this.observer.agentEnd({
							...info,
							outcome: "cancelled"
						});
						throw this.cancelledError();
					}
					this.observer.agentEnd({
						...info,
						outcome: "failed"
					});
					throw new WorkflowError$1(`child agent run failed: ${renderThrown(error)}`, "AGENT_RESULT", { cause: error });
				}
				if (this.isCancelled()) {
					this.observer.agentEnd({
						...info,
						outcome: "cancelled"
					});
					throw this.cancelledError();
				}
				if (result.stopReason === "completed") {
					if (opts.schema !== void 0) {
						if (result.structured === void 0) {
							this.commitJournal({
								kind: "agent",
								seq,
								callId,
								fingerprint,
								result: null
							});
							this.observer.agentEnd({
								...info,
								outcome: "failed"
							});
							return null;
						}
						const structured = result.structured;
						if (!schemaValueMatches(opts.schema, structured)) {
							this.commitJournal({
								kind: "agent",
								seq,
								callId,
								fingerprint,
								result: null
							});
							this.observer.agentEnd({
								...info,
								outcome: "failed"
							});
							return null;
						}
						this.commitJournal({
							kind: "agent",
							seq,
							callId,
							fingerprint,
							result: structured
						});
						this.observer.agentEnd({
							...info,
							outcome: "completed"
						});
						return result.structured;
					}
					const text = outputText(result.output);
					this.commitJournal({
						kind: "agent",
						seq,
						callId,
						fingerprint,
						result: text
					});
					this.observer.agentEnd({
						...info,
						outcome: "completed"
					});
					return text;
				}
				this.commitJournal({
					kind: "agent",
					seq,
					callId,
					fingerprint,
					result: null
				});
				this.observer.agentEnd({
					...info,
					outcome: "failed"
				});
				return null;
			} finally {
				await run.dispose();
			}
		} finally {
			this.releaseSlot();
		}
	}
	/** Materialize + validate the `agent()` options bag from the realm. */
	readAgentOptions(rawOpts) {
		if (rawOpts === void 0) return { options: {} };
		let opts;
		try {
			opts = materializeFromRealm(rawOpts, "agent() options");
		} catch (error) {
			/* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
			if (!(error instanceof MaterializeError)) throw error;
			throw new WorkflowError$1(`agent() options must be plain JSON data — ${error.message}`, "INVALID_ARGUMENT", { cause: error });
		}
		if (typeof opts !== "object" || opts === null || Array.isArray(opts)) throw new WorkflowError$1("agent() options must be an object", "INVALID_ARGUMENT");
		const record = opts;
		for (const key of Object.keys(record)) {
			if (SUPPORTED_AGENT_OPTIONS.has(key)) continue;
			if (DEFERRED_AGENT_OPTIONS.has(key)) throw new WorkflowError$1(`agent() option "${key}" is deferred and not supported by this engine (supported: label, phase, schema, provider, model)`, "UNSUPPORTED_OPTION");
			throw new WorkflowError$1(`agent() option "${key}" is not recognized (supported: label, phase, schema, provider, model)`, "UNSUPPORTED_OPTION");
		}
		for (const key of [
			"label",
			"phase",
			"provider",
			"model"
		]) if (record[key] !== void 0 && typeof record[key] !== "string") throw new WorkflowError$1(`agent() option "${key}" must be a string`, "INVALID_ARGUMENT");
		let schema;
		let providerSchema;
		if (record.schema !== void 0) try {
			const prepared = prepareObjectSchema(record.schema);
			schema = prepared.authored;
			providerSchema = prepared.provider;
		} catch (error) {
			/* v8 ignore next -- defensive rethrow arm: assertObjectJsonSchema only throws JsonSchemaError */
			if (!(error instanceof _deepseek_ai_dsh_tools.JsonSchemaError)) throw error;
			throw new WorkflowError$1(`agent() schema is outside the supported subset — ${error.message}`, "UNSUPPORTED_SCHEMA", { cause: error });
		}
		return {
			options: {
				...record.label !== void 0 ? { label: record.label } : {},
				...record.phase !== void 0 ? { phase: record.phase } : {},
				...record.provider !== void 0 ? { provider: record.provider } : {},
				...record.model !== void 0 ? { model: record.model } : {},
				...schema !== void 0 ? { schema } : {}
			},
			...providerSchema !== void 0 ? { providerSchema } : {}
		};
	}
	/**
	* The `parallel(items)` hook. Declarative job maps preflight and reserve as
	* one atomic panel; arbitrary thunks admit their unknowable agent calls at
	* execution time. Every item is a barrier slot; ordinary failures become
	* `null` and fatal workflow errors propagate.
	*/
	async parallel(rawItems) {
		this.throwIfCancelled();
		if (!Array.isArray(rawItems)) throw new WorkflowError$1("parallel() requires an array of zero-argument functions or job maps", "INVALID_ARGUMENT");
		this.assertItemCap(rawItems.length, "parallel()");
		const panelPath = this.claimCallId("parallel");
		const items = rawItems.map((item, index) => this.parallelItem(item, index, [
			...panelPath,
			index + 1,
			1
		]));
		if (items.some((item) => item.kind === "job") && items.some((item) => item.kind === "thunk")) throw new WorkflowError$1("parallel() cannot mix function thunks and declarative job maps in one panel", "INVALID_ARGUMENT");
		const inheritedPhase = this.currentScope().currentPhase;
		const branches = items.map((item, index) => ({
			item,
			scope: {
				path: [...panelPath, index + 1],
				nextNode: 0,
				...inheritedPhase === void 0 ? {} : { currentPhase: inheritedPhase },
				...item.reservesAgent ? { reservation: { available: true } } : {}
			}
		}));
		this.reservePanel(branches.map((branch) => branch.scope));
		return Promise.all(branches.map(({ item, scope }) => this.callScopes.run(scope, async () => {
			try {
				return await item.run();
			} catch (error) {
				if ((0, _deepseek_ai_dsh_workflow.isFatalWorkflowError)(error)) throw error;
				return null;
			}
		})));
	}
	/** Accept one `parallel()` item as a zero-arg thunk or a Grok job map `{ prompt, ...opts }`. */
	parallelItem(item, index, callId) {
		if (typeof item === "function") return {
			run: item,
			kind: "thunk",
			reservesAgent: false
		};
		let job;
		try {
			job = materializeFromRealm(item, `parallel() item ${index}`);
		} catch (error) {
			/* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
			if (!(error instanceof MaterializeError)) throw error;
			throw new WorkflowError$1(`parallel() item ${index} must be a function or plain job map — ${error.message}`, "INVALID_ARGUMENT", { cause: error });
		}
		if (typeof job !== "object" || job === null || Array.isArray(job)) throw new WorkflowError$1(`parallel() item ${index} is not a function or job map`, "INVALID_ARGUMENT");
		const record = job;
		const prompt = record.prompt;
		if (typeof prompt !== "string" || prompt.length === 0) throw new WorkflowError$1(`parallel() job ${index} requires a non-empty "prompt" string`, "INVALID_ARGUMENT");
		const rawOpts = {};
		for (const key of Object.keys(record)) {
			if (key === "prompt") continue;
			rawOpts[key] = record[key];
		}
		const opts = this.readAgentOptions(rawOpts).options;
		const label = opts.label ?? defaultLabel(prompt);
		const phase = opts.phase ?? this.currentScope().currentPhase;
		const effectiveOptions = {
			...opts,
			label,
			...phase === void 0 ? {} : { phase }
		};
		return {
			run: () => this.agent(prompt, effectiveOptions),
			kind: "job",
			reservesAgent: this.replayEntry(callId, "agent", fingerprintHostCall("agent", {
				prompt,
				options: effectiveOptions
			})) === void 0
		};
	}
	/** The `pipeline(items, ...stages)` hook: per-item stage chains, NO cross-stage barrier. */
	async pipeline(rawItems, rawStages) {
		this.throwIfCancelled();
		if (!Array.isArray(rawItems)) throw new WorkflowError$1("pipeline() requires an items array", "INVALID_ARGUMENT");
		this.assertItemCap(rawItems.length, "pipeline()");
		if (rawStages.length === 0) throw new WorkflowError$1("pipeline() requires at least one stage function", "INVALID_ARGUMENT");
		const stages = rawStages.map((stage, index) => {
			if (typeof stage !== "function") throw new WorkflowError$1(`pipeline() stage ${index} is not a function`, "INVALID_ARGUMENT");
			return stage;
		});
		const pipelinePath = this.claimCallId("pipeline");
		const inheritedPhase = this.currentScope().currentPhase;
		return Promise.all(rawItems.map((item, index) => this.callScopes.run({
			path: [...pipelinePath, index + 1],
			nextNode: 0,
			...inheritedPhase === void 0 ? {} : { currentPhase: inheritedPhase }
		}, async () => {
			let value = item;
			try {
				for (const stage of stages) value = await stage(value, item, index);
				return value;
			} catch (error) {
				if ((0, _deepseek_ai_dsh_workflow.isFatalWorkflowError)(error)) throw error;
				return null;
			}
		})));
	}
	assertItemCap(length, hook) {
		if (length > this.limits.maxItemsPerCall) throw new WorkflowError$1(`${hook} received ${length} items — over the per-call cap (${this.limits.maxItemsPerCall}); split the work or raise maxItemsPerCall in the engine config`, "ITEM_CAP");
	}
	/** The `phase(title)` hook: sets the current label for subsequent `agent()` calls and notifies observers. */
	phase(title) {
		this.throwIfCancelled();
		if (typeof title !== "string" || title.length === 0) throw new WorkflowError$1("phase() requires a non-empty title string", "INVALID_ARGUMENT");
		const callId = this.claimCallId("phase");
		const fingerprint = fingerprintHostCall("phase", { title });
		const replay = this.replayEntry(callId, "phase", fingerprint);
		this.currentScope().currentPhase = title;
		if (replay !== void 0) return;
		this.observer.phase(title);
		this.commitJournal({
			kind: "phase",
			callId,
			fingerprint,
			title
		});
	}
	/** The `log(message)` hook: narration to observers. */
	log(message) {
		this.throwIfCancelled();
		if (typeof message !== "string") throw new WorkflowError$1("log() requires a message string", "INVALID_ARGUMENT");
		const callId = this.claimCallId("log");
		const fingerprint = fingerprintHostCall("log", { message });
		if (this.replayEntry(callId, "log", fingerprint) !== void 0) return;
		this.observer.log(message);
		this.commitJournal({
			kind: "log",
			callId,
			fingerprint,
			message
		});
	}
	/** Resolve the deterministic call scope for a root hook or combinator branch. */
	currentScope() {
		return this.callScopes.getStore();
	}
	/** The `complete(value)` hook: terminate the run successfully with a JSON value. */
	complete(value) {
		this.throwIfCancelled();
		try {
			this.completed = { value: value === void 0 ? null : this.materializeResult(value) };
		} catch (error) {
			/* v8 ignore next -- materializeResult totalizes every failure as WorkflowError. */
			if (!(error instanceof WorkflowError$1)) throw new Error("materializing a workflow result threw outside the documented error type", { cause: error });
			this.completionError = error;
		}
		this.completionGate.resolve();
		throw COMPLETE_SENTINEL;
	}
	/** The `budget()` hook: this run's logical agent budget and its spend. */
	budget() {
		this.throwIfCancelled();
		const total = this.limits.maxTotalAgents;
		const spent = this.started;
		return {
			total,
			spent,
			reserved: 0,
			remaining: Math.max(0, total - spent)
		};
	}
	/** The `pause()`/`await_user()` gate: park the run until a resume message releases it. */
	async gate(rawKind, rawMessage, resumable) {
		this.throwIfCancelled();
		if (typeof rawKind !== "string" || rawKind.length === 0) throw new WorkflowError$1(`${resumable ? "await_user" : "pause"}() requires a non-empty kind string`, "INVALID_ARGUMENT");
		const kind = this.readGateKind(rawKind, resumable);
		const message = rawMessage === void 0 ? "" : typeof rawMessage === "string" ? rawMessage : void 0;
		if (message === void 0) throw new WorkflowError$1(`${resumable ? "await_user" : "pause"}() message must be a string`, "INVALID_ARGUMENT");
		if (this.validateOnly) {
			const diagnostic = `would ${resumable ? "await_user" : "pause"} (${kind}): ${message}`;
			this.observer.log(diagnostic);
			this.complete(diagnostic);
		}
		const callId = resumable ? this.claimCallId("await-user") : void 0;
		const fingerprint = resumable ? fingerprintHostCall("await-user", {
			kind,
			message
		}) : void 0;
		if (callId !== void 0 && fingerprint !== void 0 && this.replayEntry(callId, "await-user", fingerprint) !== void 0) return;
		if (this.gateResume !== void 0) throw new WorkflowError$1("workflow scripts may park on only one pause()/await_user() gate at a time", "INVALID_ARGUMENT");
		while (true) {
			this.throwIfCancelled();
			const gate = {
				kind,
				message,
				resumable
			};
			this.observer.gate(gate);
			await new Promise((resolve) => {
				this.gateResume = resolve;
			});
			this.gateResume = void 0;
			this.throwIfCancelled();
			if (resumable) {
				this.commitJournal({
					kind: "await-user",
					callId,
					fingerprint
				});
				return;
			}
		}
	}
	/** Normalize a gate kind with its `backoff`/`blocked` aliases. */
	readGateKind(rawKind, resumable) {
		switch (rawKind) {
			case "user":
			case "back_off":
			case "backoff":
			case "no_progress":
			case "verification":
			case "blocked":
			case "infra": break;
			default: throw new WorkflowError$1(`${resumable ? "await_user" : "pause"}() kind "${rawKind}" is not recognized (user, back_off, no_progress, verification, infra)`, "INVALID_ARGUMENT");
		}
		return rawKind === "backoff" ? "back_off" : rawKind === "blocked" ? "verification" : rawKind;
	}
	/** The `write_scratch_file(name, content)` hook: write one single-component scratch file. */
	async writeScratch(rawName, rawContent) {
		this.throwIfCancelled();
		const name = this.readScratchName(rawName);
		if (typeof rawContent !== "string") throw new WorkflowError$1("write_scratch_file() content must be a string", "INVALID_ARGUMENT");
		const callId = this.claimCallId("scratch-write");
		const fingerprint = fingerprintHostCall("scratch-write", {
			name,
			content: rawContent
		});
		if (this.replayEntry(callId, "scratch-write", fingerprint) !== void 0) return;
		await this.children.writeScratch(name, rawContent);
		this.commitJournal({
			kind: "scratch-write",
			callId,
			fingerprint
		});
	}
	/** The `read_scratch_file(name)` hook: read one single-component scratch file. */
	async readScratch(rawName) {
		this.throwIfCancelled();
		const name = this.readScratchName(rawName);
		const callId = this.claimCallId("scratch-read");
		const fingerprint = fingerprintHostCall("scratch-read", { name });
		const replay = this.replayEntry(callId, "scratch-read", fingerprint);
		if (replay !== void 0) return replay.content;
		const content = await this.children.readScratch(name);
		this.commitJournal({
			kind: "scratch-read",
			callId,
			fingerprint,
			...content === void 0 ? {} : { content }
		});
		return content;
	}
	/** Validate a single-component scratch file name (no separators or traversal). */
	readScratchName(rawName) {
		if (typeof rawName !== "string" || !SCRATCH_NAME.test(rawName)) throw new WorkflowError$1("scratch file name must be a single component (letters, digits, . _ -)", "INVALID_ARGUMENT");
		return rawName;
	}
};
/** Index a journal while rejecting ambiguous replay identities. */
function indexJournal(entries) {
	const byCallId = /* @__PURE__ */ new Map();
	const agentSequences = /* @__PURE__ */ new Set();
	let priorOrdinal = 0;
	for (const entry of entries ?? []) {
		if (!Number.isSafeInteger(entry.ordinal) || entry.ordinal !== priorOrdinal + 1) throw new WorkflowError$1("workflow journal entry ordinal must be the next positive safe integer", "JOURNAL_DIVERGENCE");
		priorOrdinal = entry.ordinal;
		if (!Array.isArray(entry.callId) || entry.callId.length === 0 || entry.callId.some((part) => !Number.isSafeInteger(part) || part <= 0) || byCallId.has(entry.callId.join("."))) throw new WorkflowError$1(`workflow journal repeats or omits call identity ${JSON.stringify(entry.callId)}`, "JOURNAL_DIVERGENCE");
		if (entry.kind === "agent" && (!Number.isSafeInteger(entry.seq) || entry.seq < 1)) throw new WorkflowError$1("workflow journal agent seq must be a positive safe integer", "JOURNAL_DIVERGENCE");
		if (entry.kind === "agent" && agentSequences.has(entry.seq)) throw new WorkflowError$1(`workflow journal repeats agent sequence ${entry.seq}`, "JOURNAL_DIVERGENCE");
		if (!/^[a-f0-9]{64}$/u.test(entry.fingerprint)) throw new WorkflowError$1("workflow journal fingerprint must be a lowercase SHA-256 digest", "JOURNAL_DIVERGENCE");
		byCallId.set(entry.callId.join("."), entry);
		if (entry.kind === "agent") agentSequences.add(entry.seq);
	}
	return byCallId;
}
/** SHA-256 one canonical effective host request for journal replay validation. */
function fingerprintHostCall(kind, request) {
	return (0, node_crypto.createHash)("sha256").update(canonicalJson({
		kind,
		request
	})).digest("hex");
}
/** Serialize JSON-like data with recursively sorted object keys. */
function canonicalJson(value) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	return `{${Object.entries(value).filter(([, child]) => child !== void 0).sort(([left], [right]) => left < right ? -1 : 1).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
}
/** Single-component scratch file name grammar. */
const SCRATCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** Sentinel thrown by `complete()`; drive() recognizes it to terminate successfully. */
const COMPLETE_SENTINEL = /* @__PURE__ */ new Error("workflow completed");
//#endregion
//#region vendor/workflow-engine/session.ts
/**
* The worker-side handle for one started child agent ({@link ChildHandle}):
* every member is an RPC to the host keyed by this call's `callId`, resolved
* by the session's message handler through the bridge's pending entry.
*/
var RpcChildHandle = class {
	constructor(post, callId, entry, id) {
		this.post = post;
		this.callId = callId;
		this.entry = entry;
		this.id = id;
		this.result = entry.settled.promise;
	}
	dispose() {
		this.post("child-dispose", { callId: this.callId });
		return this.entry.disposed.promise;
	}
};
/**
* The worker-side child-RPC bridge ({@link ChildPort}): allocates callIds,
* posts the start/dispose RPCs, and owns the per-call pending
* book-keeping the session's message handler settles via the `onChild*`
* entry points.
*/
var ChildRpcBridge = class {
	constructor(post) {
		this.post = post;
		this.nextCallId = 0;
		this.pending = /* @__PURE__ */ new Map();
		this.pendingScratch = /* @__PURE__ */ new Map();
	}
	async startAgent(request) {
		this.nextCallId += 1;
		const callId = this.nextCallId;
		const entry = {
			started: Promise.withResolvers(),
			settled: Promise.withResolvers(),
			disposed: Promise.withResolvers()
		};
		entry.settled.promise.catch(() => {});
		this.pending.set(callId, entry);
		this.post("child-start", {
			callId,
			request
		});
		const childId = await entry.started.promise;
		return new RpcChildHandle(this.post, callId, entry, childId);
	}
	async writeScratch(name, content) {
		const callId = this.claimCallId();
		const resolve = Promise.withResolvers();
		this.pendingScratch.set(callId, resolve);
		this.post("scratch-write", {
			callId,
			name,
			content
		});
		await resolve.promise;
	}
	async readScratch(name) {
		const callId = this.claimCallId();
		const resolve = Promise.withResolvers();
		this.pendingScratch.set(callId, resolve);
		this.post("scratch-read", {
			callId,
			name
		});
		return (await resolve.promise).content;
	}
	claimCallId() {
		this.nextCallId += 1;
		return this.nextCallId;
	}
	/** The host established a published child; releases the `startAgent` await. */
	onChildStarted(callId, childId) {
		this.pending.get(callId)?.started.resolve(childId);
	}
	/** Asynchronous provider start failed; reject and retire the pending RPC. */
	onChildStartError(callId, rendered) {
		const entry = this.pending.get(callId);
		this.pending.delete(callId);
		entry?.started.reject(new Error(rendered));
	}
	/** The child's terminal result arrived. */
	onChildSettled(callId, result) {
		this.pending.get(callId)?.settled.resolve(result);
	}
	/** The child's `result` rejected host-side (an infrastructure fault, relayed as fatal). */
	onChildFailed(callId, rendered) {
		this.pending.get(callId)?.settled.reject(new Error(rendered));
	}
	/** The host acked the dispose; the call's book-keeping is complete. */
	onChildDisposed(callId) {
		const entry = this.pending.get(callId);
		this.pending.delete(callId);
		entry?.disposed.resolve();
	}
	/** The host completed a scratch write. */
	onScratchWritten(callId) {
		const entry = this.pendingScratch.get(callId);
		this.pendingScratch.delete(callId);
		entry?.resolve({});
	}
	/** The host completed a scratch read (content absent = file missing). */
	onScratchReadResult(callId, content) {
		const entry = this.pendingScratch.get(callId);
		this.pendingScratch.delete(callId);
		entry?.resolve({ ...content !== void 0 ? { content } : {} });
	}
};
/**
* Narrow the nullable `parentPort` the bootstrap reads from
* `node:worker_threads`.
* @param port - `parentPort` as imported (null on the main thread).
* @returns the port, non-null.
*/
function requireParentPort(port) {
	if (port === null) throw new Error("the workflow worker entry must be loaded inside a worker thread (no parentPort)");
	return port;
}
/**
* Run one workflow script to settlement against `port`, posting the terminal result message
* exactly once; resolves after that post (stray children may still be winding down through the
* port — the host owns their teardown and ultimately terminates the thread). It never rejects:
* constructor failure becomes an error result. Host pre-parse makes syntax failure here a likely
* Node-version skew, but the session still reports it instead of dying silently.
* @param port - the channel to the host (the real `parentPort`, or one side
*   of an in-process `MessageChannel` in tests).
* @param init - the run payload the host provided as `workerData`.
*/
async function runWorkerSession(port, init) {
	const post = (type, payload) => {
		port.postMessage({
			type,
			...payload
		});
	};
	const children = new ChildRpcBridge(post);
	const observer = {
		phase: (title) => {
			post("phase", { title });
		},
		log: (message) => {
			post("log", { message });
		},
		agentStart: (info) => {
			post("agent-start", { info });
		},
		agentEnd: (info) => {
			post("agent-end", { info });
		},
		gate: (gate) => {
			post("gate", { gate });
		},
		journalCommit: (entry) => {
			post("journal-commit", { entry });
		}
	};
	let execution;
	try {
		execution = new WorkflowExecution(init.meta, init.body, init.args, init.limits, observer, children, init.journal, init.validateOnly, init.initialAgentSpend, init.initialAgentSeq);
	} catch (error) {
		post("ready", {});
		post("result", { result: {
			value: null,
			stopReason: "error",
			error: renderThrown(error),
			...error instanceof _deepseek_ai_dsh_workflow.WorkflowError ? { errorCode: error.code } : {},
			agentsStarted: Math.max(init.initialAgentSpend ?? 0, init.journal?.filter((entry) => entry.kind === "agent").length ?? 0)
		} });
		return;
	}
	const gate = Promise.withResolvers();
	port.on("message", (message) => {
		switch (message.type) {
			case "go":
				gate.resolve();
				break;
			case "cancel":
				execution.cancel(message.reason);
				gate.resolve();
				break;
			case "resume":
				execution.resume();
				break;
			case "child-started":
				children.onChildStarted(message.callId, message.childId);
				break;
			case "child-start-error":
				children.onChildStartError(message.callId, message.rendered);
				break;
			case "child-settled":
				children.onChildSettled(message.callId, message.result);
				break;
			case "child-failed":
				children.onChildFailed(message.callId, message.rendered);
				break;
			case "child-disposed":
				children.onChildDisposed(message.callId);
				break;
			case "scratch-written":
				children.onScratchWritten(message.callId);
				break;
			case "scratch-read-result":
				children.onScratchReadResult(message.callId, message.content);
				break;
			/* v8 ignore next 2 -- closed engine-owned union; the arm only makes adding a message type a compile error */
			default: (0, _deepseek_ai_dsh_llm.assertNever)(message, "host-to-worker message");
		}
	});
	post("ready", {});
	await gate.promise;
	post("result", { result: await execution.drive() });
}
//#endregion
//#region vendor/workflow-engine/worker.ts
/**
* Single-statement worker entry that boots `runWorkerSession` on real `parentPort`. Logic remains in
* the session module for in-process MessageChannel coverage; importing this entry on the main thread
* exercises `requireParentPort`'s failure path.
* @module @deepseek-ai/dsh-workflow-worker-thread/worker
*/
runWorkerSession(requireParentPort(node_worker_threads.parentPort), node_worker_threads.workerData);
//#endregion

//# sourceMappingURL=worker.cjs.map