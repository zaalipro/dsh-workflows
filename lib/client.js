window.__ModuleLoader__.load({
	id: "@zaalipro/dsh-workflows",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region lib/typert.remote-client.js
		var typert_remote_client_default = {};
		//#endregion
		//#region lib/client-types/adapter.js
		/** Stable observable adapter for the dashboard slot. */
		const EMPTY = Object.freeze({
			sessionId: "",
			phase: "idle",
			status: "idle",
			runs: Object.freeze([]),
			total: 0,
			sessionRevision: 0,
			revision: 0
		});
		var DashboardWorkflowRunsAdapter = class {
			controller;
			snapshot = EMPTY;
			listeners = /* @__PURE__ */ new Set();
			observedSessionId;
			observedSource;
			unsubscribe;
			disposed = false;
			source;
			constructor(controller) {
				this.controller = controller;
				const callable = ((sessionId) => this.controller.source(sessionId));
				callable.getSnapshot = () => this.snapshot;
				callable.subscribe = (listener) => {
					if (this.disposed) return () => void 0;
					this.listeners.add(listener);
					return () => {
						this.listeners.delete(listener);
					};
				};
				this.source = callable;
			}
			get(sessionId) {
				return this.controller.get(sessionId);
			}
			subscribe(sessionId, listener) {
				return this.controller.subscribe(sessionId, listener);
			}
			observe(sessionId) {
				if (this.disposed || sessionId === this.observedSessionId) return;
				this.unsubscribe?.();
				this.unsubscribe = void 0;
				this.observedSessionId = sessionId;
				const source = sessionId === void 0 ? void 0 : this.controller.source(sessionId);
				this.observedSource = source;
				this.publish(source?.getSnapshot() ?? {
					...EMPTY,
					sessionId: sessionId ?? ""
				}, true);
				if (source !== void 0) this.unsubscribe = source.subscribe(() => {
					if (this.observedSource === source) this.publish(source.getSnapshot(), false);
				});
			}
			/** Compatibility aliases used by the initial package prototype. */
			show(sessionId) {
				this.observe(sessionId);
			}
			close() {
				this.observe(void 0);
			}
			refresh(...args) {
				return this.controller.refresh(...args);
			}
			loadMore(...args) {
				return this.controller.loadMore(...args);
			}
			detail(...args) {
				return this.controller.detail(...args);
			}
			members(...args) {
				return this.controller.members(...args);
			}
			memberDetail(...args) {
				return this.controller.memberDetail(...args);
			}
			logs(...args) {
				return this.controller.logs(...args);
			}
			result(...args) {
				return this.controller.result(...args);
			}
			artifacts(...args) {
				return this.controller.artifacts(...args);
			}
			artifact(...args) {
				return this.controller.artifact(...args);
			}
			control(...args) {
				return this.controller.control(...args);
			}
			resolveAndOpenChild(...args) {
				return this.controller.resolveAndOpenChild(...args);
			}
			handleChange(...args) {
				this.controller.handleChange(...args);
			}
			handleDisconnected(...args) {
				this.controller.handleDisconnected(...args);
			}
			handleConnected(...args) {
				this.controller.handleConnected(...args);
			}
			handleReset(...args) {
				this.controller.handleReset(...args);
			}
			removeSession(...args) {
				this.controller.removeSession(...args);
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.unsubscribe?.();
				this.unsubscribe = void 0;
				this.observedSource = void 0;
				this.observedSessionId = void 0;
				this.listeners.clear();
			}
			publish(snapshot, force) {
				if (!force && snapshot === this.snapshot) return;
				this.snapshot = snapshot;
				for (const listener of [...this.listeners]) try {
					listener();
				} catch {}
			}
		};
		//#endregion
		//#region lib/client-types/contract.js
		var WorkflowRunsRemoteError = class extends Error {
			code;
			details;
			name = "WorkflowRunsRemoteError";
			constructor(code, message, details) {
				super(message);
				this.code = code;
				this.details = details;
			}
		};
		/** Unwrap both Typert's transport carrier and the package's business carrier. */
		function unwrapWorkflowRemoteResult(input) {
			let value = input;
			for (let depth = 0; depth < 2; depth += 1) {
				if (typeof value !== "object" || value === null || !Object.hasOwn(value, "ok")) break;
				const carrier = value;
				if (carrier.ok === true) {
					value = carrier.value;
					continue;
				}
				if (carrier.ok === false) {
					const failure = typeof carrier.error === "object" && carrier.error !== null ? carrier.error : carrier;
					throw new WorkflowRunsRemoteError(String(failure.code ?? "storage-unavailable"), String(failure.message ?? "Unable to load workflow data. Retry."), typeof failure.details === "object" && failure.details !== null ? failure.details : void 0);
				}
				break;
			}
			return value;
		}
		//#endregion
		//#region lib/client-types/controller.js
		const DEFAULT_LIMIT = 50;
		const ABORT_NAME = "AbortError";
		function abortError(reason = "The operation was aborted") {
			if (reason instanceof Error) {
				if (reason.name !== ABORT_NAME) reason.name = ABORT_NAME;
				return reason;
			}
			const error = new Error(String(reason));
			error.name = ABORT_NAME;
			return error;
		}
		function isAbort$1(error) {
			return error instanceof Error && error.name === ABORT_NAME || typeof DOMException !== "undefined" && error instanceof DOMException && error.name === ABORT_NAME;
		}
		function throwIfAborted(signal) {
			if (signal?.aborted) throw signal.reason ?? abortError();
		}
		/** Race a caller's wait without cancelling a shared baseline request. */
		function waitWithAbort(promise, signal) {
			if (signal === void 0) return promise;
			throwIfAborted(signal);
			return new Promise((resolve, reject) => {
				let settled = false;
				const cleanup = () => signal.removeEventListener("abort", onAbort);
				const onAbort = () => {
					if (settled) return;
					settled = true;
					cleanup();
					reject(signal.reason ?? abortError());
				};
				signal.addEventListener("abort", onAbort, { once: true });
				promise.then((value) => {
					if (settled) return;
					settled = true;
					cleanup();
					resolve(value);
				}, (error) => {
					if (settled) return;
					settled = true;
					cleanup();
					reject(error);
				});
			});
		}
		function combineSignals(left, right) {
			if (left === void 0) return right;
			if (typeof AbortSignal.any === "function") return AbortSignal.any([left, right]);
			const controller = new AbortController();
			const abort = () => controller.abort(left.reason ?? right.reason);
			if (left.aborted || right.aborted) abort();
			else {
				left.addEventListener("abort", abort, { once: true });
				right.addEventListener("abort", abort, { once: true });
			}
			return controller.signal;
		}
		function emptySnapshot(sessionId, phase = "idle") {
			return {
				sessionId,
				phase,
				status: phase,
				runs: [],
				total: 0,
				sessionRevision: 0,
				revision: 0
			};
		}
		function snapshotWith(sessionId, previous, patch) {
			const phase = patch.phase ?? previous.phase;
			const sessionRevision = patch.sessionRevision ?? patch.revision ?? previous.sessionRevision ?? previous.revision;
			const nextCursor = Object.hasOwn(patch, "nextCursor") ? patch.nextCursor : previous.nextCursor;
			const epoch = Object.hasOwn(patch, "epoch") ? patch.epoch : previous.epoch;
			const error = Object.hasOwn(patch, "error") ? patch.error : previous.error;
			return {
				sessionId,
				phase,
				status: phase,
				runs: patch.runs ?? previous.runs,
				total: patch.total ?? previous.total,
				...nextCursor === void 0 ? {} : { nextCursor },
				...epoch === void 0 ? {} : { epoch },
				sessionRevision,
				revision: sessionRevision,
				...error === void 0 ? {} : { error }
			};
		}
		function renderThrown(error) {
			try {
				return error instanceof Error ? error.message : String(error);
			} catch {
				return "Unable to load workflow data. Retry.";
			}
		}
		/** Lazy, revision-fenced browser source for retained workflow runs. */
		var WorkflowRunsController = class {
			states = /* @__PURE__ */ new Map();
			remote;
			agents;
			connectionGeneration = 0;
			connected = true;
			observed;
			disposed = false;
			constructor(remote, agents) {
				this.remote = remote?.workflowRuns ?? remote;
				this.agents = agents;
			}
			state(sessionId) {
				let state = this.states.get(sessionId);
				if (state !== void 0) return state;
				state = {
					sessionId,
					snapshot: emptySnapshot(sessionId, this.connected ? "idle" : "reconnecting"),
					listeners: /* @__PURE__ */ new Set(),
					requests: /* @__PURE__ */ new Set(),
					generation: this.connectionGeneration,
					removed: false,
					subscribed: false,
					followup: false
				};
				this.states.set(sessionId, state);
				return state;
			}
			get(sessionId) {
				return this.state(sessionId).snapshot;
			}
			source(sessionId) {
				const state = this.state(sessionId);
				if (state.source !== void 0) return state.source;
				state.source = {
					getSnapshot: () => state.snapshot,
					subscribe: (listener) => {
						if (this.disposed || state.removed) return () => void 0;
						state.listeners.add(listener);
						if (!state.subscribed) {
							state.subscribed = true;
							this.refresh(sessionId).catch(() => void 0);
						}
						return () => {
							state.listeners.delete(listener);
							if (state.listeners.size === 0 && this.observed !== sessionId) this.removeSession(sessionId);
						};
					}
				};
				return state.source;
			}
			subscribe(sessionId, listener) {
				const source = this.source(sessionId);
				const notify = () => listener(source.getSnapshot());
				const unsubscribe = source.subscribe(notify);
				try {
					notify();
				} catch {}
				return unsubscribe;
			}
			observe(sessionId) {
				if (this.observed === sessionId) return;
				if (this.observed !== void 0) {
					const previous = this.states.get(this.observed);
					if (previous !== void 0 && previous.listeners.size === 0) this.removeSession(this.observed);
				}
				this.observed = sessionId;
				if (sessionId === void 0 || this.disposed) return;
				const state = this.state(sessionId);
				state.subscribed = true;
				this.refresh(sessionId).catch(() => void 0);
			}
			publish(state, patch) {
				if (this.disposed || state.removed) return;
				state.snapshot = snapshotWith(state.sessionId, state.snapshot, patch);
				for (const listener of [...state.listeners]) try {
					listener();
				} catch {}
			}
			request(state, supplied) {
				const controller = new AbortController();
				state.requests.add(controller);
				return {
					signal: combineSignals(supplied, controller.signal),
					controller,
					generation: this.connectionGeneration
				};
			}
			retire(state, controller) {
				state.requests.delete(controller);
			}
			async call(method, sessionId, request, signal) {
				const fn = this.remote?.[method];
				if (typeof fn !== "function") throw new WorkflowRunsRemoteError("storage-unavailable", `workflow Remote method ${method} is unavailable`);
				const raw = await fn.call(this.remote, sessionId, request, signal);
				signal.throwIfAborted();
				return unwrapWorkflowRemoteResult(raw);
			}
			async refresh(sessionId, supplied) {
				if (this.disposed) return this.get(sessionId);
				const state = this.state(sessionId);
				if (state.removed || !this.connected) return state.snapshot;
				if (state.refreshFlight !== void 0) return waitWithAbort(state.refreshFlight, supplied);
				const request = this.request(state);
				const generation = request.generation;
				let operation;
				operation = (async () => {
					this.publish(state, {
						phase: "loading",
						error: void 0
					});
					try {
						const page = await this.call("list", sessionId, { limit: DEFAULT_LIMIT }, request.signal);
						if (state.removed || this.disposed || generation !== this.connectionGeneration || request.signal.aborted) return state.snapshot;
						const items = Array.isArray(page?.items) ? page.items : [];
						const sessionRevision = Number.isSafeInteger(page?.sessionRevision) ? page.sessionRevision : 0;
						this.publish(state, {
							phase: "ready",
							runs: items,
							total: Number.isSafeInteger(page?.total) ? page.total : items.length,
							nextCursor: page?.nextCursor,
							epoch: typeof page?.epoch === "string" ? page.epoch : void 0,
							sessionRevision,
							revision: sessionRevision,
							error: void 0
						});
						const hinted = state.hintedRevision;
						state.hintedRevision = void 0;
						if (hinted !== void 0 && hinted > sessionRevision) state.followup = true;
						return state.snapshot;
					} catch (error) {
						if (isAbort$1(error) || request.signal.aborted || generation !== this.connectionGeneration) return state.snapshot;
						this.publish(state, {
							phase: "error",
							runs: state.snapshot.runs,
							total: state.snapshot.total,
							error: renderThrown(error)
						});
						throw error;
					} finally {
						this.retire(state, request.controller);
						if (state.refreshFlight === operation) state.refreshFlight = void 0;
						if (state.followup && this.connected && !state.removed && !this.disposed) {
							state.followup = false;
							queueMicrotask(() => {
								if (state.refreshFlight === void 0 && (state.listeners.size > 0 || this.observed === sessionId)) this.refresh(sessionId).catch(() => void 0);
							});
						}
					}
				})();
				state.refreshFlight = operation;
				return waitWithAbort(operation, supplied);
			}
			async loadMore(sessionId, supplied) {
				const state = this.state(sessionId);
				const cursor = state.snapshot.nextCursor;
				if (state.removed || this.disposed || cursor === void 0 || !this.connected) return state.snapshot;
				if (state.pageFlight !== void 0) return waitWithAbort(state.pageFlight, supplied);
				const request = this.request(state, supplied);
				const generation = request.generation;
				const expectedEpoch = state.snapshot.epoch;
				const expectedRevision = state.snapshot.sessionRevision;
				let operation;
				operation = (async () => {
					try {
						const page = await this.call("list", sessionId, {
							cursor,
							limit: DEFAULT_LIMIT
						}, request.signal);
						if (state.removed || this.disposed || generation !== this.connectionGeneration || request.signal.aborted) return state.snapshot;
						if (expectedEpoch !== void 0 && page?.epoch !== void 0 && page.epoch !== expectedEpoch || page?.sessionRevision !== void 0 && page.sessionRevision !== expectedRevision) {
							await this.refresh(sessionId);
							return state.snapshot;
						}
						const incoming = Array.isArray(page?.items) ? page.items : [];
						const known = new Set(state.snapshot.runs.map((run) => run.runId));
						const rows = [...state.snapshot.runs];
						for (const row of incoming) if (known.has(row.runId)) {
							const index = rows.findIndex((existing) => existing.runId === row.runId);
							if (index >= 0 && row.revision > rows[index].revision) rows[index] = row;
						} else {
							known.add(row.runId);
							rows.push(row);
						}
						this.publish(state, {
							phase: "ready",
							runs: rows,
							total: Number.isSafeInteger(page?.total) ? page.total : Math.max(state.snapshot.total, rows.length),
							nextCursor: page?.nextCursor,
							sessionRevision: Number.isSafeInteger(page?.sessionRevision) ? page.sessionRevision : expectedRevision,
							revision: Number.isSafeInteger(page?.sessionRevision) ? page.sessionRevision : expectedRevision,
							error: void 0
						});
						return state.snapshot;
					} catch (error) {
						if (isAbort$1(error) || request.signal.aborted || generation !== this.connectionGeneration) return state.snapshot;
						this.publish(state, {
							phase: "error",
							runs: state.snapshot.runs,
							total: state.snapshot.total,
							error: renderThrown(error)
						});
						throw error;
					} finally {
						this.retire(state, request.controller);
						if (state.pageFlight === operation) state.pageFlight = void 0;
					}
				})();
				state.pageFlight = operation;
				return waitWithAbort(operation, supplied);
			}
			async read(sessionId, method, requestBody, supplied) {
				const state = this.state(sessionId);
				if (state.removed || this.disposed) throw abortError("workflow Session was removed");
				const request = this.request(state, supplied);
				try {
					const value = await this.call(method, sessionId, requestBody, request.signal);
					if (state.removed || this.disposed || request.generation !== this.connectionGeneration) throw abortError("workflow request was superseded");
					return value;
				} finally {
					this.retire(state, request.controller);
				}
			}
			detail(sessionId, runId, signal) {
				return this.read(sessionId, "detail", { runId }, signal);
			}
			members(sessionId, runId, cursor, signal) {
				return this.read(sessionId, "members", {
					runId,
					...cursor === void 0 ? {} : { cursor },
					limit: DEFAULT_LIMIT
				}, signal);
			}
			memberDetail(sessionId, runId, memberId, signal) {
				return this.read(sessionId, "memberDetail", {
					runId,
					memberId
				}, signal);
			}
			logs(sessionId, runId, cursor, signal) {
				return this.read(sessionId, "logs", {
					runId,
					...cursor === void 0 ? {} : { cursor },
					limit: DEFAULT_LIMIT
				}, signal);
			}
			result(sessionId, runId, signal) {
				return this.read(sessionId, "result", { runId }, signal);
			}
			artifacts(sessionId, runId, cursor, signal) {
				return this.read(sessionId, "artifacts", {
					runId,
					...cursor === void 0 ? {} : { cursor },
					limit: DEFAULT_LIMIT
				}, signal);
			}
			artifact(sessionId, runId, name, cursor, expectedRevision, signal) {
				return this.read(sessionId, "artifact", {
					runId,
					name,
					...cursor === void 0 ? {} : { cursor },
					...expectedRevision === void 0 ? {} : { expectedRevision }
				}, signal);
			}
			async control(sessionId, runId, action, expectedRevision, signal) {
				const state = this.state(sessionId);
				const beforeGeneration = this.connectionGeneration;
				try {
					const result = await this.read(sessionId, "control", {
						runId,
						action,
						expectedRevision
					}, signal);
					if (beforeGeneration !== this.connectionGeneration || state.removed || this.disposed) return result;
					const row = result?.run;
					if (row === void 0) return result;
					const index = state.snapshot.runs.findIndex((candidate) => candidate.runId === row.runId);
					if (index >= 0 && row.revision >= state.snapshot.runs[index].revision) {
						const runs = state.snapshot.runs.map((candidate, i) => i === index ? row : candidate);
						this.publish(state, {
							phase: "ready",
							runs,
							error: void 0
						});
					}
					if (state.snapshot.nextCursor !== void 0 && state.listeners.size > 0 && this.connected) this.refresh(sessionId).catch(() => void 0);
					return result;
				} catch (error) {
					if (error instanceof WorkflowRunsRemoteError && error.code === "revision-conflict") {
						const authoritative = error.details?.run;
						if (authoritative !== void 0) {
							const runs = state.snapshot.runs.map((row) => row.runId === authoritative.runId ? authoritative : row);
							this.publish(state, { runs });
						}
						this.refresh(sessionId).catch(() => void 0);
					}
					throw error;
				}
			}
			handleChange(change) {
				if (this.disposed) return;
				if (change.kind === "invalidate-all") {
					for (const state of this.states.values()) {
						if (state.removed || !state.subscribed) continue;
						if (state.refreshFlight !== void 0) state.followup = true;
						else if (this.connected) this.refresh(state.sessionId).catch(() => void 0);
						else state.followup = true;
					}
					return;
				}
				const state = this.states.get(change.sessionId);
				if (state === void 0 || state.removed || !state.subscribed) return;
				const current = state.snapshot.sessionRevision ?? state.snapshot.revision;
				if (change.revision <= current) return;
				state.hintedRevision = Math.max(state.hintedRevision ?? 0, change.revision);
				if (state.refreshFlight !== void 0) {
					state.followup = true;
					return;
				}
				if (this.connected) this.refresh(change.sessionId).catch(() => void 0);
				else state.followup = true;
			}
			handleDisconnected() {
				this.connected = false;
				this.connectionGeneration += 1;
				for (const state of this.states.values()) {
					if (state.removed) continue;
					state.generation = this.connectionGeneration;
					for (const controller of state.requests) controller.abort(abortError("workflow connection disconnected"));
					state.requests.clear();
					state.refreshFlight = void 0;
					state.pageFlight = void 0;
					this.publish(state, { phase: "reconnecting" });
				}
			}
			/** Fence an explicit connection/reset even when description loss was not observed. */
			handleReset() {
				if (this.disposed) return;
				this.connected = true;
				this.connectionGeneration += 1;
				for (const state of this.states.values()) {
					if (state.removed) continue;
					state.generation = this.connectionGeneration;
					for (const controller of state.requests) controller.abort(abortError("workflow connection reset"));
					state.requests.clear();
					state.refreshFlight = void 0;
					state.pageFlight = void 0;
					state.hintedRevision = void 0;
					state.followup = false;
					if (state.subscribed && (state.listeners.size > 0 || this.observed === state.sessionId)) this.refresh(state.sessionId).catch(() => void 0);
				}
			}
			handleConnected() {
				if (this.disposed) return;
				this.connected = true;
				for (const state of this.states.values()) {
					if (state.removed || !state.subscribed) continue;
					state.hintedRevision = void 0;
					state.followup = false;
					if (state.listeners.size > 0 || this.observed === state.sessionId) this.refresh(state.sessionId).catch(() => void 0);
				}
			}
			removeSession(sessionId) {
				const state = this.states.get(sessionId);
				if (state === void 0) return;
				state.removed = true;
				state.generation += 1;
				for (const controller of state.requests) controller.abort(abortError("workflow Session was removed"));
				state.requests.clear();
				state.refreshFlight = void 0;
				state.pageFlight = void 0;
				state.snapshot = emptySnapshot(sessionId);
				for (const listener of [...state.listeners]) try {
					listener();
				} catch {}
				state.listeners.clear();
				this.states.delete(sessionId);
				if (this.observed === sessionId) this.observed = void 0;
			}
			async resolveAndOpenChild(parentSessionId, childSessionId) {
				try {
					const sessions = this.agents?.sessions ?? this.agents;
					if (sessions === void 0) return false;
					await sessions.refreshSubagents?.(parentSessionId);
					const byParent = (sessions.list?.getSnapshot?.() ?? this.agents?.list?.getSnapshot?.())?.subagentsByParent?.[parentSessionId];
					if (byParent?.state !== "ready") return false;
					if (byParent.entries?.find((candidate) => {
						const id = candidate?.id ?? candidate?.childSessionId;
						const parent = candidate?.parentSessionId ?? candidate?.parentId;
						return candidate?.kind === "child" && candidate?.mode === "one-shot" && id === childSessionId && (parent === void 0 || parent === parentSessionId);
					}) === void 0) return false;
					const address = {
						parentSessionId,
						childSessionId,
						mode: "one-shot"
					};
					if (typeof sessions.openSubagent === "function") {
						sessions.openSubagent(address);
						return true;
					}
					if (typeof this.agents?.openSubagent === "function") {
						this.agents.openSubagent(address);
						return true;
					}
					return false;
				} catch {
					return false;
				}
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.connectionGeneration += 1;
				for (const state of this.states.values()) {
					state.removed = true;
					for (const controller of state.requests) controller.abort(abortError("workflow controller disposed"));
					state.requests.clear();
					state.listeners.clear();
				}
				this.states.clear();
				this.observed = void 0;
			}
			/** Compatibility names used by early package consumers. */
			invalidate(change) {
				this.handleChange(change);
			}
			reconnecting() {
				this.handleDisconnected();
			}
		};
		//#endregion
		//#region lib/client-types/workflow-definition.js
		/**
		* Build a stable phase key without conflating an omitted field and `''`.
		* @param phase - exact phase text, or null when the field was omitted.
		* @returns a collision-free renderer key.
		*/
		function workflowPhaseKey(phase) {
			return phase === null ? "missing" : `value:${phase.length}:${phase}`;
		}
		function eventOf(event) {
			return event;
		}
		function statusFromStopReason(stopReason) {
			switch (stopReason) {
				case "completed": return "completed";
				case "cancelled":
				case "interrupted": return "cancelled";
				case "error":
				case "failed": return "failed";
				default: return "failed";
			}
		}
		function statusFromOutcome(outcome) {
			switch (outcome) {
				case "completed": return "completed";
				case "cancelled":
				case "interrupted": return "cancelled";
				case "error":
				case "failed": return "failed";
				default: return "failed";
			}
		}
		function projectWorkflow(context, _location) {
			const state = context.state;
			const phases = /* @__PURE__ */ new Map();
			for (const member of state.members) {
				const phase = member.phase === void 0 ? null : member.phase;
				const key = workflowPhaseKey(phase);
				let group = phases.get(key);
				if (group === void 0) {
					group = {
						phase,
						members: []
					};
					phases.set(key, group);
				}
				group.members.push({
					seq: member.seq,
					label: member.label,
					childId: member.childId,
					status: member.outcome === void 0 ? "running" : statusFromOutcome(member.outcome)
				});
			}
			return {
				name: state.name,
				status: state.stopReason === void 0 ? "running" : statusFromStopReason(state.stopReason),
				phases: [...phases].map(([key, phase]) => ({
					key,
					phase: phase.phase,
					members: phase.members
				}))
			};
		}
		function updateAgentStart(state, data) {
			const seq = Number(data.seq);
			if (!Number.isSafeInteger(seq) || seq < 1 || state.members.some((member) => member.seq === seq)) return state;
			const member = {
				seq,
				label: String(data.label ?? ""),
				childId: String(data.childId ?? data.childSessionId ?? ""),
				...data.phase === void 0 ? {} : { phase: String(data.phase) }
			};
			return {
				...state,
				members: [...state.members, member]
			};
		}
		function updateAgentEnd(state, data) {
			const seq = Number(data.seq);
			return {
				...state,
				members: state.members.map((member) => member.seq === seq ? {
					...member,
					outcome: String(data.outcome ?? "error")
				} : member)
			};
		}
		/** Fold only the four official durable workflow events into one keyed Chat node. */
		const workflowRunDefinition = {
			kind: "workflow-run",
			target: "chat",
			match: (rawEvent) => {
				const event = eventOf(rawEvent);
				if (event.type === "tool-workflow/run-start") return {
					id: String(event.data.runId),
					role: "start"
				};
				if (event.type === "tool-workflow/agent-start" || event.type === "tool-workflow/agent-end" || event.type === "tool-workflow/run-end") return {
					id: String(event.data.runId),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				const event = eventOf(match.event);
				if (event.type !== "tool-workflow/run-start") throw new Error("workflow-run start requires tool-workflow/run-start");
				return {
					name: String(event.data.name ?? ""),
					members: []
				};
			},
			update: (context, match) => {
				const event = eventOf(match.event);
				if (event.type === "tool-workflow/agent-start") return updateAgentStart(context.state, event.data);
				if (event.type === "tool-workflow/agent-end") return updateAgentEnd(context.state, event.data);
				if (event.type === "tool-workflow/run-end") return {
					...context.state,
					stopReason: String(event.data.stopReason ?? "error")
				};
				return context.state;
			},
			buildViewNode: (context) => {
				if (context.start === void 0 || context.state === void 0) return null;
				const data = projectWorkflow(context, context.start.location);
				return {
					key: context.key,
					kind: "workflow-run",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data
				};
			}
		};
		/** Backward-compatible public name used by some Chat registration faces. */
		const workflowMessageDefinition = workflowRunDefinition;
		//#endregion
		//#region lib/client-types/locales.js
		/** Locale namespace registered by the browser contribution. */
		const NS = "workflows";
		/** Exact Interrupted settlement copy (Requirement 5.4 / 11.2). */
		const INTERRUPTED_SETTLEMENT = "Process exited before workflow settlement.";
		const workflowLocales = {
			en: {
				title: "Workflows",
				emptyTitle: "No workflow runs yet",
				emptyBody: "Launch a saved workflow to see its progress here.",
				close: "Close workflows",
				inspect: (n) => `Inspect · ${n} members`,
				pause: "Pause",
				resume: "Resume",
				stop: "Stop",
				save: "Save",
				commandDescription: "Open the live workflow run dashboard",
				loading: "Loading workflow runs…",
				reconnecting: "Reconnecting…",
				retry: "Retry",
				kbdHint: "P pause · R resume · X stop · S save · Esc close",
				noPhaseYet: "No phase yet",
				unphased: "Unphased",
				emptyPhase: "Empty phase name",
				agentsCompact: (done, total) => `${done}/${total} agents`,
				statusRunning: "Running",
				statusPausing: "Pausing",
				statusStopping: "Stopping",
				statusNeedsInput: "Needs input",
				statusPaused: "Paused",
				statusBudgetLimited: "Budget limited",
				statusCompleted: "Completed",
				statusFailed: "Failed",
				statusCancelled: "Stopped",
				statusInterrupted: "Interrupted",
				interruptedSettlement: INTERRUPTED_SETTLEMENT,
				budgetLimitTitle: "Agent budget exhausted",
				budgetLimitBody: "This run cannot resume here. Resume through the model workflow tool with a higher agent_budget. Stop remains available; Save is available only when this run is eligible.",
				noLogLines: "No log lines",
				noRetainedLogLines: "No retained log lines",
				copy: "Copy",
				copied: "Copied",
				copyFailed: "Copy failed",
				copyJson: "Copy JSON",
				backRuns: "Runs",
				backExecution: "Execution",
				livePhaseCurrent: "Current",
				livePhaseReached: "Reached",
				livePhaseUpcoming: "Upcoming",
				memberRunning: "Running",
				memberCompleted: "Done",
				memberFailed: "Failed",
				memberCancelled: "Stopped",
				outcomePending: "Pending",
				outcomeAvailable: "Outcome ready",
				outcomeNotProduced: "No outcome",
				outcomeEvicted: "Outcome evicted",
				chatNoMembers: "No members started",
				chatUnphased: "Unphased",
				chatEmptyPhase: "Empty phase name",
				chatEmptyMember: "Empty member name",
				chatChildUnavailable: "Child transcript unavailable",
				chatChildFailed: "Unable to open child transcript",
				chatInspectOne: "Inspect · 1 member",
				chatInspectMany: (n) => `Inspect · ${n} members`,
				chatOpenMember: (label) => `Open ${label}`,
				chatRunning: "Running",
				chatCompleted: "Completed",
				chatFailed: "Failed",
				chatCancelled: "Cancelled",
				chatInterrupted: "Interrupted"
			},
			zh: {
				title: "工作流",
				emptyTitle: "尚无工作流运行",
				emptyBody: "启动一个已保存的工作流即可在这里查看进度。",
				close: "关闭工作流",
				inspect: (n) => `检查 · ${n} 个成员`,
				pause: "暂停",
				resume: "继续",
				stop: "停止",
				save: "保存",
				commandDescription: "打开实时工作流运行仪表盘",
				loading: "正在载入工作流运行…",
				reconnecting: "正在重新连接…",
				retry: "重试",
				kbdHint: "P 暂停 · R 继续 · X 停止 · S 保存 · Esc 关闭",
				noPhaseYet: "尚无阶段",
				unphased: "未分阶段",
				emptyPhase: "空阶段名称",
				agentsCompact: (done, total) => `${done}/${total} 个代理`,
				statusRunning: "运行中",
				statusPausing: "正在暂停",
				statusStopping: "正在停止",
				statusNeedsInput: "等待输入",
				statusPaused: "已暂停",
				statusBudgetLimited: "预算已用尽",
				statusCompleted: "已完成",
				statusFailed: "失败",
				statusCancelled: "已停止",
				statusInterrupted: "已中断",
				interruptedSettlement: INTERRUPTED_SETTLEMENT,
				budgetLimitTitle: "代理预算已用尽",
				budgetLimitBody: "此运行不能直接继续。请通过模型工作流工具提高 agent_budget 后继续。仍可停止；仅当此运行符合保存条件时才可保存。",
				noLogLines: "没有日志",
				noRetainedLogLines: "没有保留的日志",
				copy: "复制",
				copied: "已复制",
				copyFailed: "复制失败",
				copyJson: "复制 JSON",
				backRuns: "运行列表",
				backExecution: "执行详情",
				livePhaseCurrent: "当前",
				livePhaseReached: "已到达",
				livePhaseUpcoming: "待执行",
				memberRunning: "运行中",
				memberCompleted: "完成",
				memberFailed: "失败",
				memberCancelled: "已停止",
				outcomePending: "待生成",
				outcomeAvailable: "可查看",
				outcomeNotProduced: "未生成",
				outcomeEvicted: "已清理",
				chatNoMembers: "没有启动成员",
				chatUnphased: "未分阶段",
				chatEmptyPhase: "空阶段名",
				chatEmptyMember: "空成员名",
				chatChildUnavailable: "子会话记录不可用",
				chatChildFailed: "无法打开子会话记录",
				chatInspectOne: "检查 · 1 个成员",
				chatInspectMany: (n) => `检查 · ${n} 个成员`,
				chatOpenMember: (label) => `打开 ${label}`,
				chatRunning: "运行中",
				chatCompleted: "已完成",
				chatFailed: "失败",
				chatCancelled: "已取消",
				chatInterrupted: "已中断"
			}
		};
		/** Pick the registered dictionary that matches a bound translator (or English). */
		function workflowLocaleFromBind(translate) {
			if (typeof translate !== "function") return workflowLocales.en;
			try {
				return String(translate("title")) === workflowLocales.zh.title ? workflowLocales.zh : workflowLocales.en;
			} catch {
				return workflowLocales.en;
			}
		}
		function workflowChatLabelsFromLocale(locale) {
			const status = {
				running: locale.chatRunning,
				completed: locale.chatCompleted,
				failed: locale.chatFailed,
				cancelled: locale.chatCancelled,
				interrupted: locale.chatInterrupted
			};
			return {
				noMembers: locale.chatNoMembers,
				unphased: locale.chatUnphased,
				emptyPhase: locale.chatEmptyPhase,
				emptyMember: locale.chatEmptyMember,
				childUnavailable: locale.chatChildUnavailable,
				childFailed: locale.chatChildFailed,
				inspect: (count) => count === 1 ? locale.chatInspectOne : locale.chatInspectMany(count),
				status,
				statusCount: (key, count) => `${status[key]} ${count}`,
				openMember: locale.chatOpenMember
			};
		}
		function dashboardLabelsFromLocale(locale) {
			return {
				title: locale.title,
				emptyTitle: locale.emptyTitle,
				emptyBody: locale.emptyBody,
				close: locale.close,
				pause: locale.pause,
				resume: locale.resume,
				stop: locale.stop,
				save: locale.save,
				loading: locale.loading,
				reconnecting: locale.reconnecting,
				retry: locale.retry,
				kbdHint: locale.kbdHint,
				noPhaseYet: locale.noPhaseYet,
				unphased: locale.unphased,
				emptyPhase: locale.emptyPhase,
				agentsCompact: locale.agentsCompact,
				status: {
					running: locale.statusRunning,
					pausing: locale.statusPausing,
					stopping: locale.statusStopping,
					"needs-input": locale.statusNeedsInput,
					paused: locale.statusPaused,
					"budget-limited": locale.statusBudgetLimited,
					completed: locale.statusCompleted,
					failed: locale.statusFailed,
					cancelled: locale.statusCancelled,
					interrupted: locale.statusInterrupted
				},
				interruptedSettlement: locale.interruptedSettlement,
				budgetLimitTitle: locale.budgetLimitTitle,
				budgetLimitBody: locale.budgetLimitBody,
				noLogLines: locale.noLogLines,
				noRetainedLogLines: locale.noRetainedLogLines,
				copy: locale.copy,
				copied: locale.copied,
				copyFailed: locale.copyFailed,
				copyJson: locale.copyJson,
				backRuns: locale.backRuns,
				backExecution: locale.backExecution,
				livePhaseCurrent: locale.livePhaseCurrent,
				livePhaseReached: locale.livePhaseReached,
				livePhaseUpcoming: locale.livePhaseUpcoming,
				memberStatus: {
					running: locale.memberRunning,
					completed: locale.memberCompleted,
					failed: locale.memberFailed,
					cancelled: locale.memberCancelled
				},
				outcome: {
					pending: locale.outcomePending,
					available: locale.outcomeAvailable,
					"not-produced": locale.outcomeNotProduced,
					evicted: locale.outcomeEvicted
				}
			};
		}
		//#endregion
		//#region \0dsh-workflows-css:src/client/WorkflowRunPanel.module.css.mjs
		const css$2 = ".IoRRWG_root,.IoRRWG_root *{box-sizing:border-box}.IoRRWG_root{width:100%;min-width:0;color:var(--dsw-alias-label-primary)}.IoRRWG_runHeader,.IoRRWG_phaseHeader{width:100%;min-width:0;color:var(--dsw-alias-label-secondary);font:inherit;text-align:start;border:0;align-items:center;gap:.5rem;display:flex}button.IoRRWG_runHeader,button.IoRRWG_phaseHeader{cursor:pointer}.IoRRWG_runHeader{background:var(--dsw-alias-bg-module-platform);border-radius:.5rem;min-height:2.25rem;padding:.25rem .625rem}.IoRRWG_phaseHeader{background:var(--dsw-alias-bg-base);min-height:2rem;padding:.125rem 0}.IoRRWG_runHeader:focus-visible,.IoRRWG_phaseHeader:focus-visible,.IoRRWG_memberButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.IoRRWG_chevron{width:1rem;height:1rem;color:var(--dsw-alias-label-tertiary);flex:none;place-items:center;font-size:1rem;line-height:1;display:inline-grid;transform:rotate(90deg)}.IoRRWG_chevron[data-open=false]{transform:rotate(0)}.IoRRWG_runName,.IoRRWG_phaseTitle,.IoRRWG_memberLabel{overflow-wrap:anywhere;min-width:0}.IoRRWG_runName{max-width:42%;color:var(--dsw-alias-label-primary);flex:0 auto;font-size:.875rem;font-weight:650;line-height:1.35}.IoRRWG_runCount,.IoRRWG_phaseCount{min-width:0;color:var(--dsw-alias-label-tertiary);flex:1;font-size:.75rem;line-height:1.4}.IoRRWG_runStatus,.IoRRWG_phaseStatus,.IoRRWG_memberStatus{color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:.375rem;font-size:.75rem;line-height:1.4;display:inline-flex}.IoRRWG_stateDot{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-label-tertiary);border-radius:50%;flex:none;width:.5rem;height:.5rem}.IoRRWG_stateDot[data-status=running]{background:var(--dsw-alias-state-business-primary)}.IoRRWG_stateDot[data-status=completed]{background:var(--dsw-alias-state-success-primary)}.IoRRWG_stateDot[data-status=failed]{background:var(--dsw-alias-state-error-primary)}.IoRRWG_stateDot[data-status=cancelled],.IoRRWG_stateDot[data-status=interrupted]{background:var(--dsw-alias-state-warn-primary)}.IoRRWG_phaseList{flex-direction:column;gap:.25rem;min-width:0;padding:.375rem 0 0 1rem;display:flex}.IoRRWG_phase{min-width:0}.IoRRWG_phaseTitle{max-width:36%;color:var(--dsw-alias-label-secondary);flex:0 auto;font-size:.8125rem;font-weight:580}.IoRRWG_phaseStatus{text-align:end;max-width:45%}.IoRRWG_members{flex-direction:column;gap:.125rem;min-width:0;padding-left:1rem;display:flex}.IoRRWG_memberRow,.IoRRWG_memberButton{background:var(--dsw-alias-bg-base);width:100%;min-width:0;min-height:1.875rem;color:var(--dsw-alias-label-secondary);font:inherit;text-align:start;border:0;border-radius:.25rem;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.625rem;padding:.1875rem .25rem;display:grid}.IoRRWG_memberButton{cursor:pointer}.IoRRWG_memberButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.IoRRWG_memberButton .IoRRWG_memberLabel{color:var(--dsw-alias-state-business-primary);text-underline-position:from-font;text-decoration:underline}.IoRRWG_memberLabel{font-size:.8125rem;line-height:1.45}.IoRRWG_empty,.IoRRWG_navigationFeedback{color:var(--dsw-alias-label-tertiary);margin:0;font-size:.75rem;line-height:1.5}.IoRRWG_navigationFeedback{color:var(--dsw-alias-label-secondary);padding:.375rem .625rem 0}@media (width<=35rem){.IoRRWG_runHeader,.IoRRWG_phaseHeader{flex-wrap:wrap;align-items:flex-start}.IoRRWG_runName,.IoRRWG_phaseTitle{max-width:calc(100% - 1.5rem)}.IoRRWG_runCount,.IoRRWG_phaseCount{flex-basis:calc(100% - 1.5rem);padding-left:1.5rem}.IoRRWG_runStatus,.IoRRWG_phaseStatus{margin-left:1.5rem}.IoRRWG_phaseList,.IoRRWG_members{padding-left:.75rem}}@media (prefers-reduced-motion:reduce){.IoRRWG_root *,.IoRRWG_root :before,.IoRRWG_root :after{transition:none!important;animation:none!important}}";
		const tagId$2 = "@zaalipro/dsh-workflows/WorkflowRunPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@zaalipro/dsh-workflows";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var WorkflowRunPanel_module_css_default = {
			"chevron": "IoRRWG_chevron",
			"empty": "IoRRWG_empty",
			"memberButton": "IoRRWG_memberButton",
			"memberLabel": "IoRRWG_memberLabel",
			"memberRow": "IoRRWG_memberRow",
			"members": "IoRRWG_members",
			"memberStatus": "IoRRWG_memberStatus",
			"navigationFeedback": "IoRRWG_navigationFeedback",
			"phase": "IoRRWG_phase",
			"phaseCount": "IoRRWG_phaseCount",
			"phaseHeader": "IoRRWG_phaseHeader",
			"phaseList": "IoRRWG_phaseList",
			"phaseStatus": "IoRRWG_phaseStatus",
			"phaseTitle": "IoRRWG_phaseTitle",
			"root": "IoRRWG_root",
			"runCount": "IoRRWG_runCount",
			"runHeader": "IoRRWG_runHeader",
			"runName": "IoRRWG_runName",
			"runStatus": "IoRRWG_runStatus",
			"stateDot": "IoRRWG_stateDot"
		};
		//#endregion
		//#region lib/client-types/WorkflowRunPanel.js
		const DEFAULT_LABELS = workflowChatLabelsFromLocale(workflowLocales.en);
		function abnormal(status) {
			return status === "failed" || status === "cancelled" || status === "interrupted";
		}
		function factsForPhase(phase) {
			return {
				mode: phase.members.some((member) => abnormal(member.status)) ? "abnormal" : phase.members.some((member) => member.status === "running") ? "running" : "clean",
				count: phase.members.length
			};
		}
		function factsForRun(data) {
			const phases = data.phases.map(factsForPhase);
			return {
				mode: abnormal(data.status) || phases.some((phase) => phase.mode === "abnormal") ? "abnormal" : data.status === "running" || phases.some((phase) => phase.mode === "running") ? "running" : "clean",
				count: phases.reduce((total, phase) => total + phase.count, 0)
			};
		}
		function initialWorkflowDisclosure(facts) {
			return {
				...facts,
				open: facts.mode !== "clean"
			};
		}
		/** Force abnormal/running open; auto-fold a clean completion once. */
		function advanceWorkflowDisclosure(current, facts) {
			if (facts.mode !== "clean") return {
				...facts,
				open: true
			};
			if (current.mode !== "clean") return {
				...facts,
				open: false
			};
			if (current.count !== facts.count) return {
				...facts,
				open: false
			};
			return {
				...facts,
				open: current.open
			};
		}
		function phaseName(phase, labels) {
			if (phase === null) return labels.unphased;
			return phase === "" ? labels.emptyPhase : phase;
		}
		function memberName(label, labels) {
			return label === "" ? labels.emptyMember : label;
		}
		function statusSummary(members, labels) {
			const counts = /* @__PURE__ */ new Map();
			for (const member of members) counts.set(member.status, (counts.get(member.status) ?? 0) + 1);
			return [
				"completed",
				"running",
				"failed",
				"cancelled",
				"interrupted"
			].filter((status) => (counts.get(status) ?? 0) > 0).map((status) => labels.statusCount(status, counts.get(status) ?? 0)).join(" · ");
		}
		function StatusDot({ status }) {
			return (0, react_jsx_runtime.jsx)("span", {
				className: WorkflowRunPanel_module_css_default.stateDot,
				"data-status": status,
				"aria-hidden": "true"
			});
		}
		function DisclosureHeader({ clean, open, onToggle, className, children }) {
			if (!clean) return (0, react_jsx_runtime.jsxs)("div", {
				className,
				"data-forced-open": "true",
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.chevron,
					"aria-hidden": "true",
					children: "›"
				}), children]
			});
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className,
				"aria-expanded": open,
				onClick: onToggle,
				children: [(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.chevron,
					"data-open": open ? "true" : "false",
					"aria-hidden": "true",
					children: "›"
				}), children]
			});
		}
		function MemberRow({ member, labels, isChildAvailable, onOpen }) {
			const label = memberName(member.label, labels);
			const available = isChildAvailable(member.childId);
			const content = (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)(StatusDot, { status: member.status }),
				(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.memberLabel,
					children: label
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.memberStatus,
					children: labels.status[member.status]
				})
			] });
			if (!available) return (0, react_jsx_runtime.jsx)("div", {
				className: WorkflowRunPanel_module_css_default.memberRow,
				"data-member-status": member.status,
				children: content
			});
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: WorkflowRunPanel_module_css_default.memberButton,
				"data-member-status": member.status,
				"aria-label": labels.openMember(label),
				onClick: () => {
					onOpen(member);
				},
				children: content
			});
		}
		function PhaseSection({ phase, choice, labels, isChildAvailable, onToggle, onOpen }) {
			const clean = choice.mode === "clean";
			const open = clean ? choice.open : true;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: WorkflowRunPanel_module_css_default.phase,
				"aria-label": phaseName(phase.phase, labels),
				children: [(0, react_jsx_runtime.jsxs)(DisclosureHeader, {
					clean,
					open,
					onToggle,
					className: WorkflowRunPanel_module_css_default.phaseHeader,
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.phaseTitle,
							children: phaseName(phase.phase, labels)
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.phaseCount,
							children: labels.inspect(phase.members.length)
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.phaseStatus,
							children: statusSummary(phase.members, labels)
						})
					]
				}), open && (0, react_jsx_runtime.jsx)("div", {
					className: WorkflowRunPanel_module_css_default.members,
					children: phase.members.map((member) => (0, react_jsx_runtime.jsx)(MemberRow, {
						member,
						labels,
						isChildAvailable,
						onOpen
					}, member.seq))
				})]
			});
		}
		/** Render one durable workflow run without exposing logical run or child ids. */
		function WorkflowRunPanel({ node, resolveAndOpenChild, isChildAvailable = () => false, labels: labelOverrides }) {
			const labels = {
				...DEFAULT_LABELS,
				...labelOverrides,
				status: {
					...DEFAULT_LABELS.status,
					...labelOverrides?.status
				}
			};
			const runFacts = factsForRun(node.data);
			const [runChoice, setRunChoice] = (0, react.useState)(() => initialWorkflowDisclosure(runFacts));
			const [phaseChoices, setPhaseChoices] = (0, react.useState)(() => new Map(node.data.phases.map((phase) => [phase.key, initialWorkflowDisclosure(factsForPhase(phase))])));
			const [navigationFeedback, setNavigationFeedback] = (0, react.useState)();
			const navigationGeneration = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				setRunChoice((current) => advanceWorkflowDisclosure(current, runFacts));
				setPhaseChoices((current) => {
					const next = /* @__PURE__ */ new Map();
					for (const phase of node.data.phases) {
						const facts = factsForPhase(phase);
						next.set(phase.key, current.has(phase.key) ? advanceWorkflowDisclosure(current.get(phase.key), facts) : initialWorkflowDisclosure(facts));
					}
					return next;
				});
			}, [
				node.data,
				runFacts.count,
				runFacts.mode
			]);
			(0, react.useEffect)(() => () => {
				navigationGeneration.current += 1;
			}, []);
			const runOpen = runChoice.mode === "clean" ? runChoice.open : true;
			const openMember = (member) => {
				const generation = ++navigationGeneration.current;
				setNavigationFeedback(void 0);
				resolveAndOpenChild(member.childId).then((opened) => {
					if (generation === navigationGeneration.current && !opened) setNavigationFeedback(labels.childUnavailable);
				}, () => {
					if (generation === navigationGeneration.current) setNavigationFeedback(labels.childFailed);
				});
			};
			return (0, react_jsx_runtime.jsxs)("section", {
				className: WorkflowRunPanel_module_css_default.root,
				"data-workflow-run": true,
				"data-run-status": node.data.status,
				children: [
					(0, react_jsx_runtime.jsxs)(DisclosureHeader, {
						clean: runChoice.mode === "clean",
						open: runOpen,
						onToggle: () => {
							setRunChoice((current) => ({
								...current,
								open: !current.open
							}));
						},
						className: WorkflowRunPanel_module_css_default.runHeader,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: WorkflowRunPanel_module_css_default.runName,
								children: node.data.name
							}),
							(0, react_jsx_runtime.jsx)("span", {
								className: WorkflowRunPanel_module_css_default.runCount,
								children: labels.inspect(runFacts.count)
							}),
							(0, react_jsx_runtime.jsxs)("span", {
								className: WorkflowRunPanel_module_css_default.runStatus,
								children: [(0, react_jsx_runtime.jsx)(StatusDot, { status: node.data.status }), labels.status[node.data.status]]
							})
						]
					}),
					runOpen && (0, react_jsx_runtime.jsx)("div", {
						className: WorkflowRunPanel_module_css_default.phaseList,
						children: node.data.phases.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
							className: WorkflowRunPanel_module_css_default.empty,
							children: labels.noMembers
						}) : node.data.phases.map((phase) => {
							const choice = phaseChoices.get(phase.key) ?? initialWorkflowDisclosure(factsForPhase(phase));
							return (0, react_jsx_runtime.jsx)(PhaseSection, {
								phase,
								choice,
								labels,
								isChildAvailable,
								onToggle: () => {
									setPhaseChoices((current) => {
										const next = new Map(current);
										next.set(phase.key, {
											...choice,
											open: !choice.open
										});
										return next;
									});
								},
								onOpen: openMember
							}, `${phase.key}:${choice.mode === "clean" ? choice.count : "active"}`);
						})
					}),
					navigationFeedback !== void 0 && (0, react_jsx_runtime.jsx)("p", {
						className: WorkflowRunPanel_module_css_default.navigationFeedback,
						role: "status",
						children: navigationFeedback
					})
				]
			});
		}
		//#endregion
		//#region lib/client-types/chat-renderer.js
		/** Chat registration name used by the package Client wiring. */
		const workflowMessageDefinition$1 = workflowRunDefinition;
		//#endregion
		//#region lib/client-types/store.js
		/** Framework-neutral interaction store for the workflow dashboard. */
		const initial = () => ({
			open: false,
			selectedRunId: void 0,
			selectedMemberId: void 0,
			selectedArtifactName: void 0,
			inspectorTab: "members",
			mobileView: "runs"
		});
		/** Pure dashboard state transitions. */
		const workflowsActions = {
			open: (draft) => {
				draft.open = true;
			},
			close: (draft) => {
				draft.open = false;
			},
			selectRun: (draft, runId) => {
				if (draft.selectedRunId !== runId) {
					draft.selectedMemberId = void 0;
					draft.selectedArtifactName = void 0;
					draft.inspectorTab = "members";
				}
				draft.selectedRunId = runId;
				draft.mobileView = "execution";
			},
			reconcileRun: (draft, runId, visibleRunIds) => {
				const candidate = runId === void 0 ? visibleRunIds?.[0] : visibleRunIds === void 0 || visibleRunIds.includes(runId) ? runId : visibleRunIds[0];
				if (candidate !== draft.selectedRunId) {
					draft.selectedMemberId = void 0;
					draft.selectedArtifactName = void 0;
					draft.inspectorTab = "members";
				}
				draft.selectedRunId = candidate;
			},
			selectMember: (draft, memberId) => {
				draft.selectedMemberId = memberId;
				draft.inspectorTab = "members";
				draft.mobileView = "inspector";
			},
			selectArtifact: (draft, name) => {
				draft.selectedArtifactName = name;
				draft.inspectorTab = "artifacts";
				draft.mobileView = "inspector";
			},
			selectTab: (draft, tab) => {
				draft.inspectorTab = tab;
				if (tab === "members") {
					draft.mobileView = "execution";
					draft.selectedArtifactName = void 0;
				} else {
					draft.mobileView = "inspector";
					if (tab !== "artifacts") draft.selectedArtifactName = void 0;
					draft.selectedMemberId = void 0;
				}
			},
			showRuns: (draft) => {
				draft.mobileView = "runs";
			},
			showExecution: (draft) => {
				draft.mobileView = "execution";
			},
			showRun: (draft) => {
				draft.mobileView = "execution";
			}
		};
		/**
		* Create a store definition plus a small standalone runtime.  Its `init` and
		* `actions` fields mirror the official store contract, while `dispatch` makes
		* it directly testable without importing a second browser state library.
		*/
		function createWorkflowsStore() {
			const standalone = createRuntime();
			return {
				init: initial,
				actions: workflowsActions,
				spec: {
					init: initial,
					actions: workflowsActions
				},
				get state() {
					return standalone.getSnapshot();
				},
				getState: standalone.getSnapshot,
				dispatch: (action, ...args) => {
					standalone.run(action, args);
				},
				subscribe: standalone.subscribe,
				create: createBoundInstance,
				dispose: standalone.dispose
			};
		}
		function createRuntime() {
			let current = initial();
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				for (const listener of [...listeners]) try {
					listener();
				} catch {}
			};
			const set = (next) => {
				current = next;
				publish();
			};
			const update = (mutator) => {
				const draft = { ...current };
				mutator(draft);
				set(draft);
			};
			return {
				getSnapshot: () => current,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				run: (action, args) => {
					update((draft) => {
						workflowsActions[action](draft, ...args);
					});
				},
				update,
				set,
				dispose: () => {
					listeners.clear();
				}
			};
		}
		function createBoundInstance() {
			const runtime = createRuntime();
			const actions = {};
			for (const action of Object.keys(workflowsActions)) actions[action] = (...args) => {
				runtime.run(action, args);
			};
			return {
				actions,
				getSnapshot: runtime.getSnapshot,
				subscribe: runtime.subscribe,
				clearPersisted: () => void 0,
				store: {
					getSnapshot: runtime.getSnapshot,
					subscribe: runtime.subscribe,
					update: runtime.update,
					set: runtime.set
				}
			};
		}
		const createWorkflowStore = createWorkflowsStore;
		//#endregion
		//#region node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-workflows-css:src/client/WorkflowMemberInspector.module.css.mjs
		const css$1 = ".dfU-3W_root{min-width:0;color:var(--dsw-alias-label-primary)}.dfU-3W_header{border-bottom:1px solid var(--dsw-alias-border-l3);justify-content:space-between;align-items:flex-start;gap:.75rem;padding-bottom:.75rem;display:flex}.dfU-3W_header h2,.dfU-3W_header p,.dfU-3W_body h3,.dfU-3W_body p{margin:0}.dfU-3W_header button,.dfU-3W_child button,.dfU-3W_error button{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);min-width:2.75rem;min-height:2.75rem;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:.4rem}.dfU-3W_eyebrow{color:var(--dsw-alias-label-tertiary);letter-spacing:.08em;text-transform:uppercase;font-size:.7rem}.dfU-3W_muted{color:var(--dsw-alias-label-secondary)}.dfU-3W_body{gap:.65rem;padding-top:1rem;display:grid}.dfU-3W_value{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);max-width:100%;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:.4rem;margin:0;padding:.75rem;overflow:auto}.dfU-3W_markdown{overflow-wrap:anywhere;min-width:0}.dfU-3W_markdown p,.dfU-3W_markdown ul,.dfU-3W_markdown h4,.dfU-3W_markdown h5,.dfU-3W_markdown h6{margin:0 0 .5rem}.dfU-3W_markdown ul{padding-left:1.25rem}.dfU-3W_copyRow{flex-wrap:wrap;align-items:center;gap:.5rem;display:flex}.dfU-3W_error{color:var(--dsw-alias-state-error-primary);gap:.65rem;display:grid}.dfU-3W_child{color:var(--dsw-alias-label-secondary);gap:.4rem;padding-top:1rem;display:grid}.dfU-3W_child p{margin:0}.dfU-3W_header button:focus-visible,.dfU-3W_child button:focus-visible,.dfU-3W_error button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (prefers-reduced-motion:reduce){.dfU-3W_root *{transition:none!important;animation:none!important}}";
		const tagId$1 = "@zaalipro/dsh-workflows/WorkflowMemberInspector.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@zaalipro/dsh-workflows";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var WorkflowMemberInspector_module_css_default = {
			"body": "dfU-3W_body",
			"child": "dfU-3W_child",
			"copyRow": "dfU-3W_copyRow",
			"error": "dfU-3W_error",
			"eyebrow": "dfU-3W_eyebrow",
			"header": "dfU-3W_header",
			"markdown": "dfU-3W_markdown",
			"muted": "dfU-3W_muted",
			"root": "dfU-3W_root",
			"value": "dfU-3W_value"
		};
		//#endregion
		//#region lib/client-types/WorkflowMemberInspector.js
		function json(value) {
			try {
				return JSON.stringify(value, null, 2);
			} catch {
				return "[unavailable]";
			}
		}
		function availableHeading(value) {
			if (typeof value === "string") return "Text outcome";
			if (value === null || typeof value === "object") return "JSON outcome";
			return "Value outcome";
		}
		function retainedBytes(text) {
			return new TextEncoder().encode(text).byteLength;
		}
		function renderInline(text) {
			const nodes = [];
			const pattern = /(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*]+?\*)/gu;
			let last = 0;
			let match;
			let index = 0;
			while ((match = pattern.exec(text)) !== null) {
				if (match.index > last) nodes.push(text.slice(last, match.index));
				const token = match[0];
				if (token.startsWith("**")) nodes.push((0, react_jsx_runtime.jsx)("strong", { children: token.slice(2, -2) }, `b${index}`));
				else if (token.startsWith("`")) nodes.push((0, react_jsx_runtime.jsx)("code", { children: token.slice(1, -1) }, `c${index}`));
				else nodes.push((0, react_jsx_runtime.jsx)("em", { children: token.slice(1, -1) }, `i${index}`));
				last = match.index + token.length;
				index += 1;
			}
			if (last < text.length) nodes.push(text.slice(last));
			return nodes;
		}
		/** Bounded Markdown/plain-text renderer. Strings must not be JSON.stringified. */
		function MarkdownText({ text }) {
			const lines = text.replace(/\r\n/gu, "\n").split("\n");
			const blocks = [];
			let paragraph = [];
			let listItems = [];
			const flushParagraph = () => {
				if (paragraph.length === 0) return;
				blocks.push((0, react_jsx_runtime.jsx)("p", { children: renderInline(paragraph.join("\n")) }, `p${blocks.length}`));
				paragraph = [];
			};
			const flushList = () => {
				if (listItems.length === 0) return;
				blocks.push((0, react_jsx_runtime.jsx)("ul", { children: listItems }, `ul${blocks.length}`));
				listItems = [];
			};
			for (const line of lines) if (line.startsWith("### ")) {
				flushParagraph();
				flushList();
				blocks.push((0, react_jsx_runtime.jsx)("h6", { children: renderInline(line.slice(4)) }, `h${blocks.length}`));
			} else if (line.startsWith("## ")) {
				flushParagraph();
				flushList();
				blocks.push((0, react_jsx_runtime.jsx)("h5", { children: renderInline(line.slice(3)) }, `h${blocks.length}`));
			} else if (line.startsWith("# ")) {
				flushParagraph();
				flushList();
				blocks.push((0, react_jsx_runtime.jsx)("h4", { children: renderInline(line.slice(2)) }, `h${blocks.length}`));
			} else if (line.startsWith("- ") || line.startsWith("* ")) {
				flushParagraph();
				listItems.push((0, react_jsx_runtime.jsx)("li", { children: renderInline(line.slice(2)) }, `li${listItems.length}`));
			} else if (line === "") {
				flushParagraph();
				flushList();
			} else {
				flushList();
				paragraph.push(line);
			}
			flushParagraph();
			flushList();
			if (blocks.length === 0) return (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.markdown,
				children: text
			});
			return (0, react_jsx_runtime.jsx)("div", {
				className: WorkflowMemberInspector_module_css_default.markdown,
				children: blocks
			});
		}
		async function writeClipboard(text) {
			try {
				if (typeof navigator === "undefined" || navigator.clipboard?.writeText === void 0) return false;
				await navigator.clipboard.writeText(text);
				return true;
			} catch {
				return false;
			}
		}
		function CopyControl({ text, label, copiedLabel, failedLabel }) {
			const [state, setState] = (0, react.useState)("idle");
			const onClick = () => {
				writeClipboard(text).then((ok) => {
					setState(ok ? "copied" : "failed");
				});
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: WorkflowMemberInspector_module_css_default.copyRow,
				children: [
					(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick,
						"aria-label": label,
						children: label
					}),
					state === "copied" && (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						children: copiedLabel
					}),
					state === "failed" && (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						children: failedLabel
					})
				]
			});
		}
		function OutcomeBody({ outcome, labels }) {
			if (outcome.state === "pending") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Pending" }), (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.muted,
				children: "The member has not produced an outcome yet."
			})] });
			if (outcome.state === "not-produced") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("h3", { children: "No outcome produced" }), (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.muted,
				children: "This member finished without a retained result."
			})] });
			if (outcome.state === "evicted") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Outcome evicted" }), (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.muted,
				children: "The retained outcome was evicted to stay within storage limits."
			})] });
			if (outcome.state !== "available") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Pending" }), (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.muted,
				children: "The member has not produced an outcome yet."
			})] });
			if (outcome.content.kind === "preview") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("h3", { children: "Truncated outcome" }),
				(0, react_jsx_runtime.jsxs)("p", {
					className: WorkflowMemberInspector_module_css_default.muted,
					children: [
						retainedBytes(outcome.content.text),
						" bytes retained of ",
						outcome.totalBytes,
						" bytes total."
					]
				}),
				(0, react_jsx_runtime.jsx)("pre", {
					className: WorkflowMemberInspector_module_css_default.value,
					"aria-label": "Truncated outcome preview",
					children: outcome.content.text
				})
			] });
			const value = outcome.content.value;
			const heading = availableHeading(value);
			if (heading === "Text outcome") {
				const text = String(value);
				return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					(0, react_jsx_runtime.jsx)("h3", { children: "Text outcome" }),
					(0, react_jsx_runtime.jsx)(MarkdownText, { text }),
					(0, react_jsx_runtime.jsx)(CopyControl, {
						text,
						label: labels.copy,
						copiedLabel: labels.copied,
						failedLabel: labels.copyFailed
					})
				] });
			}
			if (heading === "JSON outcome") {
				const serialized = json(value);
				return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					(0, react_jsx_runtime.jsx)("h3", { children: "JSON outcome" }),
					(0, react_jsx_runtime.jsx)("pre", {
						className: WorkflowMemberInspector_module_css_default.value,
						"aria-label": "JSON outcome",
						children: serialized
					}),
					(0, react_jsx_runtime.jsx)(CopyControl, {
						text: serialized,
						label: labels.copyJson,
						copiedLabel: labels.copied,
						failedLabel: labels.copyFailed
					})
				] });
			}
			const serialized = json(value);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("h3", { children: "Value outcome" }),
				(0, react_jsx_runtime.jsx)("pre", {
					className: WorkflowMemberInspector_module_css_default.value,
					"aria-label": "Value outcome",
					children: serialized
				}),
				(0, react_jsx_runtime.jsx)(CopyControl, {
					text: serialized,
					label: labels.copy,
					copiedLabel: labels.copied,
					failedLabel: labels.copyFailed
				})
			] });
		}
		/** Render one bounded member outcome without conflating null, absence, or eviction. */
		function WorkflowMemberInspector({ member, detail, outcome: explicitOutcome, loading = false, error, onRetry, onClose, onOpenChild, labels: labelOverrides }) {
			const labels = labelOverrides ?? dashboardLabelsFromLocale(workflowLocales.en);
			const [childUnavailable, setChildUnavailable] = (0, react.useState)(false);
			const outcome = explicitOutcome ?? detail?.outcome;
			const childId = detail && "childSessionId" in detail ? detail.childSessionId : void 0;
			(0, react.useEffect)(() => {
				setChildUnavailable(false);
			}, [childId]);
			const openChild = () => {
				if (onOpenChild === void 0) return;
				Promise.resolve(onOpenChild()).then((opened) => {
					if (!opened) setChildUnavailable(true);
				}, () => {
					setChildUnavailable(true);
				});
			};
			let body;
			if (loading) body = (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				children: "Loading member outcome…"
			});
			else if (error !== void 0) body = (0, react_jsx_runtime.jsxs)("div", {
				className: WorkflowMemberInspector_module_css_default.error,
				role: "alert",
				children: [(0, react_jsx_runtime.jsx)("p", { children: "Unable to load member outcome" }), onRetry !== void 0 && (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: onRetry,
					children: "Retry"
				})]
			});
			else if (outcome === void 0) body = (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Pending" }), (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.muted,
				children: "The member has not produced an outcome yet."
			})] });
			else body = (0, react_jsx_runtime.jsx)(OutcomeBody, {
				outcome,
				labels
			});
			return (0, react_jsx_runtime.jsxs)("section", {
				className: WorkflowMemberInspector_module_css_default.root,
				"aria-label": "Workflow member inspector",
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: WorkflowMemberInspector_module_css_default.header,
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [
							(0, react_jsx_runtime.jsx)("p", {
								className: WorkflowMemberInspector_module_css_default.eyebrow,
								children: "Member outcome"
							}),
							(0, react_jsx_runtime.jsx)("h2", { children: member?.label || "Member" }),
							member?.phase !== void 0 && (0, react_jsx_runtime.jsx)("p", {
								className: WorkflowMemberInspector_module_css_default.muted,
								children: member.phase || labels.emptyPhase
							})
						] }), onClose !== void 0 && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onClose,
							"aria-label": "Close member inspector",
							children: "Close"
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: WorkflowMemberInspector_module_css_default.body,
						children: body
					}),
					childId !== void 0 && onOpenChild !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
						className: WorkflowMemberInspector_module_css_default.child,
						children: [(0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: openChild,
							children: "Open child session"
						}), childUnavailable && (0, react_jsx_runtime.jsx)("p", {
							role: "status",
							children: "Child transcript unavailable"
						})]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-workflows-css:src/client/WorkflowsDashboard.module.css.mjs
		const css = ".ENrH5a_dashboard,.ENrH5a_dashboard *{box-sizing:border-box}[data-shell-overlay]:has([data-workflows-dashboard]){z-index:1000}.ENrH5a_dashboard{z-index:1000;background:var(--dsw-alias-bg-base);width:100%;min-width:0;max-width:100%;height:100dvh;color:var(--dsw-alias-label-primary);flex-direction:column;display:flex;position:fixed;inset:0;overflow:hidden}.ENrH5a_header{border-bottom:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);flex-wrap:wrap;flex:none;justify-content:space-between;align-items:flex-start;gap:1rem;min-width:0;padding:clamp(.875rem,2vw,1.5rem) clamp(.875rem,2.5vw,2rem);display:flex}.ENrH5a_headerCopy{flex:12rem;min-width:0}.ENrH5a_header h1,.ENrH5a_header p,.ENrH5a_executionHeader h2,.ENrH5a_executionHeader p,.ENrH5a_empty h2,.ENrH5a_empty p,.ENrH5a_error p,.ENrH5a_feedback p,.ENrH5a_notice,.ENrH5a_navigatorFooter p,.ENrH5a_inspectorHeading h2,.ENrH5a_groupEmpty,.ENrH5a_retention,.ENrH5a_logLine{margin:0}.ENrH5a_header h1{font-size:clamp(1.75rem,4vw,3.25rem);line-height:1}.ENrH5a_eyebrow{color:var(--dsw-alias-label-tertiary);letter-spacing:.1em;text-transform:uppercase;font-size:.75rem;font-weight:700}.ENrH5a_topSummary,.ENrH5a_muted,.ENrH5a_retention,.ENrH5a_groupEmpty{color:var(--dsw-alias-label-secondary)}.ENrH5a_topSummary{padding-top:.35rem;font-size:.875rem}.ENrH5a_kbdHint{color:var(--dsw-alias-label-tertiary);font-size:.75rem}.ENrH5a_close,.ENrH5a_dashboard button{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);min-width:44px;min-height:44px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;border-radius:.45rem}.ENrH5a_close{flex:none;padding:0 1rem}.ENrH5a_dashboard button:disabled{cursor:wait;opacity:.55}.ENrH5a_notice,.ENrH5a_error,.ENrH5a_feedback{border-bottom:1px solid var(--dsw-alias-border-l3);flex:none;justify-content:space-between;align-items:center;gap:.75rem;padding:.65rem clamp(.875rem,2.5vw,2rem);display:flex}.ENrH5a_notice,.ENrH5a_feedback{color:var(--dsw-alias-label-secondary)}.ENrH5a_error,.ENrH5a_errorText{color:var(--dsw-alias-state-error-primary)}.ENrH5a_error button,.ENrH5a_feedback button{flex:none;padding:0 .85rem}.ENrH5a_empty{text-align:center;flex:1;place-content:center;gap:.55rem;min-width:0;min-height:0;padding:1rem;display:grid}.ENrH5a_layout{background:var(--dsw-alias-border-l3);flex:1;grid-template-columns:minmax(17rem,.82fr) minmax(25rem,1.18fr) minmax(18rem,.9fr);gap:1px;min-width:0;min-height:0;display:grid;overflow:hidden}.ENrH5a_navigator,.ENrH5a_detail,.ENrH5a_inspector{overscroll-behavior:contain;background:var(--dsw-alias-bg-base);min-width:0;min-height:0;overflow:hidden auto}.ENrH5a_navigator{flex-direction:column;display:flex}.ENrH5a_runGroup{background:var(--dsw-alias-border-l3);gap:1px;min-width:0;display:grid}.ENrH5a_runGroup h2,.ENrH5a_groupEmpty{background:var(--dsw-alias-bg-base);padding:.65rem .8rem}.ENrH5a_runGroup h2{z-index:1;color:var(--dsw-alias-label-secondary);letter-spacing:.08em;text-transform:uppercase;margin:0;font-size:.75rem;position:sticky;top:0}.ENrH5a_runRow{background:var(--dsw-alias-bg-module-platform);width:100%;min-width:0;height:auto;color:var(--dsw-alias-label-primary);text-align:start;border:0;border-radius:0;gap:.3rem;padding:.8rem;display:grid}.ENrH5a_runRow[data-selected=true]{box-shadow:inset .25rem 0 0 var(--dsw-alias-state-business-primary)}.ENrH5a_runRow>span{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);font-size:.78rem}.ENrH5a_runTitle{justify-content:space-between;align-items:baseline;gap:.65rem;display:flex}.ENrH5a_runTitle strong{color:var(--dsw-alias-label-primary);font-size:.95rem}.ENrH5a_runTitle span{flex:none}.ENrH5a_navigatorFooter{border-top:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);gap:.6rem;margin-top:auto;padding:.8rem;display:grid}.ENrH5a_navigatorFooter>button,.ENrH5a_members>button,.ENrH5a_paneContents>button{width:100%;padding:0 .8rem}.ENrH5a_detail,.ENrH5a_inspector{padding:clamp(.9rem,2.2vw,1.8rem)}.ENrH5a_executionHeader{justify-content:space-between;align-items:flex-start;gap:1rem;min-width:0;display:flex}.ENrH5a_executionHeader>div:first-child{min-width:0}.ENrH5a_executionHeader h2,.ENrH5a_executionHeader p{overflow-wrap:anywhere}.ENrH5a_actions{flex-wrap:wrap;flex:none;justify-content:flex-end;gap:.4rem;display:flex}.ENrH5a_actions button{min-width:4rem;padding:0 .7rem}.ENrH5a_detail>.ENrH5a_error,.ENrH5a_detail>.ENrH5a_feedback,.ENrH5a_members .ENrH5a_error,.ENrH5a_paneContents .ENrH5a_error{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);border-radius:.45rem;margin:.75rem 0;padding:.65rem}.ENrH5a_facts{border-top:1px solid var(--dsw-alias-border-l3);margin:1rem 0;display:grid}.ENrH5a_facts div{border-bottom:1px solid var(--dsw-alias-border-l3);grid-template-columns:minmax(7.5rem,.35fr) minmax(0,1fr);gap:.75rem;min-width:0;padding:.5rem 0;display:grid}.ENrH5a_facts dt{color:var(--dsw-alias-label-tertiary)}.ENrH5a_facts dd{overflow-wrap:anywhere;min-width:0;margin:0}.ENrH5a_phaseRail{grid-template-columns:repeat(auto-fit,minmax(min(11rem,100%),1fr));gap:.5rem;margin:.6rem 0 1rem;padding:0;list-style-position:inside;display:grid}.ENrH5a_phaseRail li{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);overflow-wrap:anywhere;border-radius:.45rem;gap:.25rem;min-width:0;padding:.65rem;display:grid}.ENrH5a_phaseRail span,.ENrH5a_phaseRail small{color:var(--dsw-alias-label-secondary)}.ENrH5a_phaseRail li[data-current=true]{border-color:var(--dsw-alias-state-business-primary)}.ENrH5a_phaseRail li[data-current=true] strong{color:var(--dsw-alias-state-business-primary)}.ENrH5a_tabs{border-bottom:1px solid var(--dsw-alias-border-l3);flex-wrap:wrap;gap:.35rem;margin:1rem 0 .75rem;padding-bottom:.5rem;display:flex}.ENrH5a_tabs button{padding:0 .7rem}.ENrH5a_tabs button[aria-selected=true]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.ENrH5a_members,.ENrH5a_memberGroup,.ENrH5a_paneContents,.ENrH5a_artifactViewer{gap:.55rem;min-width:0;display:grid}.ENrH5a_memberGroup{margin-top:.5rem}.ENrH5a_memberGroup h3,.ENrH5a_artifactViewer h3{color:var(--dsw-alias-label-secondary);margin:0;font-size:.85rem}.ENrH5a_memberGroup button,.ENrH5a_artifactList button{text-align:start;justify-content:space-between;align-items:center;gap:.65rem;width:100%;min-width:0;padding:.45rem .65rem;display:flex}.ENrH5a_memberGroup button span,.ENrH5a_artifactList button span{overflow-wrap:anywhere;min-width:0}.ENrH5a_memberGroup button span:not(:first-child),.ENrH5a_artifactList button span:last-child{color:var(--dsw-alias-label-secondary);flex:none;font-size:.78rem}.ENrH5a_inspectorHeading{border-bottom:1px solid var(--dsw-alias-border-l3);align-items:center;gap:.7rem;margin-bottom:.8rem;padding-bottom:.7rem;display:flex}.ENrH5a_inspectorHeading h2{overflow-wrap:anywhere;min-width:0}.ENrH5a_drilldownBack{flex:none;min-width:44px;min-height:44px;padding:0 .7rem;display:none}.ENrH5a_callout{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);border-radius:.45rem;gap:.35rem;margin:.75rem 0;padding:.65rem;display:grid}.ENrH5a_paneContents pre,.ENrH5a_artifactViewer pre{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);max-width:100%;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:.45rem;margin:0;padding:.75rem;overflow:auto}.ENrH5a_logLine{border-bottom:1px solid var(--dsw-alias-border-l3);grid-template-columns:auto minmax(0,1fr);gap:.6rem;padding:.45rem 0;display:grid}.ENrH5a_logLine span{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.ENrH5a_artifactList{gap:.4rem;min-width:0;display:grid}.ENrH5a_artifactList button[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary)}.ENrH5a_artifactViewer{border-top:1px solid var(--dsw-alias-border-l3);margin-top:.65rem;padding-top:.75rem}.ENrH5a_dashboard button:focus-visible,.ENrH5a_dashboard [tabindex]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (width<=1199px){.ENrH5a_layout{grid-template-columns:minmax(16rem,.72fr) minmax(0,1.28fr)}.ENrH5a_navigator{grid-column:1}.ENrH5a_detail,.ENrH5a_inspector{grid-area:1/2}.ENrH5a_dashboard:not([data-mobile-view=inspector]) .ENrH5a_inspector,.ENrH5a_dashboard[data-mobile-view=inspector] .ENrH5a_detail{display:none}.ENrH5a_drilldownBack{justify-content:center;align-self:flex-start;align-items:center;min-width:44px;min-height:44px;margin-bottom:.65rem;display:inline-flex}}@media (width<=767px){.ENrH5a_header{padding:.75rem}.ENrH5a_layout{display:block}.ENrH5a_navigator,.ENrH5a_detail,.ENrH5a_inspector{width:100%;height:100%;padding:.75rem;display:none}.ENrH5a_dashboard[data-mobile-view=runs] .ENrH5a_navigator,.ENrH5a_dashboard[data-mobile-view=execution] .ENrH5a_detail,.ENrH5a_dashboard[data-mobile-view=inspector] .ENrH5a_inspector{flex-direction:column;display:flex}.ENrH5a_executionHeader,.ENrH5a_facts div{grid-template-columns:minmax(0,1fr)}.ENrH5a_executionHeader{flex-direction:column}.ENrH5a_actions{justify-content:flex-start;width:100%}.ENrH5a_dashboard button{min-width:44px;min-height:44px}}@media (width<=320px){.ENrH5a_header{gap:.5rem}.ENrH5a_headerCopy,.ENrH5a_kbdHint{flex-basis:100%;min-width:0}.ENrH5a_kbdHint{display:none}.ENrH5a_header h1{font-size:1.55rem}.ENrH5a_close{margin-left:auto;padding:0 .65rem}.ENrH5a_runTitle,.ENrH5a_memberGroup button,.ENrH5a_artifactList button,.ENrH5a_error,.ENrH5a_feedback,.ENrH5a_notice{flex-direction:column;align-items:stretch}.ENrH5a_runTitle span,.ENrH5a_memberGroup button span:not(:first-child),.ENrH5a_artifactList button span:last-child{flex:initial}}@media (prefers-reduced-motion:reduce){.ENrH5a_dashboard,.ENrH5a_dashboard *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}";
		const tagId = "@zaalipro/dsh-workflows/WorkflowsDashboard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@zaalipro/dsh-workflows";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WorkflowsDashboard_module_css_default = {
			"actions": "ENrH5a_actions",
			"artifactList": "ENrH5a_artifactList",
			"artifactViewer": "ENrH5a_artifactViewer",
			"callout": "ENrH5a_callout",
			"close": "ENrH5a_close",
			"dashboard": "ENrH5a_dashboard",
			"detail": "ENrH5a_detail",
			"drilldownBack": "ENrH5a_drilldownBack",
			"empty": "ENrH5a_empty",
			"error": "ENrH5a_error",
			"errorText": "ENrH5a_errorText",
			"executionHeader": "ENrH5a_executionHeader",
			"eyebrow": "ENrH5a_eyebrow",
			"facts": "ENrH5a_facts",
			"feedback": "ENrH5a_feedback",
			"groupEmpty": "ENrH5a_groupEmpty",
			"header": "ENrH5a_header",
			"headerCopy": "ENrH5a_headerCopy",
			"inspector": "ENrH5a_inspector",
			"inspectorHeading": "ENrH5a_inspectorHeading",
			"kbdHint": "ENrH5a_kbdHint",
			"layout": "ENrH5a_layout",
			"logLine": "ENrH5a_logLine",
			"memberGroup": "ENrH5a_memberGroup",
			"members": "ENrH5a_members",
			"muted": "ENrH5a_muted",
			"navigator": "ENrH5a_navigator",
			"navigatorFooter": "ENrH5a_navigatorFooter",
			"notice": "ENrH5a_notice",
			"paneContents": "ENrH5a_paneContents",
			"phaseRail": "ENrH5a_phaseRail",
			"retention": "ENrH5a_retention",
			"runGroup": "ENrH5a_runGroup",
			"runRow": "ENrH5a_runRow",
			"runTitle": "ENrH5a_runTitle",
			"tabs": "ENrH5a_tabs",
			"topSummary": "ENrH5a_topSummary"
		};
		//#endregion
		//#region lib/client-types/WorkflowsDashboard.js
		const TERMINAL = /* @__PURE__ */ new Set([
			"completed",
			"failed",
			"cancelled",
			"interrupted"
		]);
		const ACTION_ORDER = [
			"pause",
			"resume",
			"stop",
			"save"
		];
		const SHORTCUTS = {
			p: "pause",
			r: "resume",
			x: "stop",
			s: "save"
		};
		const GENERIC_LOAD_ERROR = "Unable to load workflow data. Retry.";
		const GENERIC_CONTROL_ERROR = "Unable to update workflow. Retry.";
		const STALE_CONTROL_ERROR = "workflow run changed; refresh it before applying a control";
		function emptySource(sessionId = "") {
			return {
				sessionId,
				phase: "idle",
				status: "idle",
				runs: [],
				total: 0,
				sessionRevision: 0,
				revision: 0
			};
		}
		function isActive(status) {
			return !TERMINAL.has(status);
		}
		function statusLabel(status, labels) {
			return labels.status[status];
		}
		function formatDuration(ms) {
			const seconds = Math.max(0, Math.floor(ms / 1e3));
			if (seconds < 60) return `${seconds}s`;
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return `${minutes}m`;
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return `${hours}h`;
			return `${Math.floor(hours / 24)}d`;
		}
		/** Stable active-oldest/history-newest ordering required by the dashboard. */
		function orderWorkflowRuns(rows) {
			return [...rows].sort((left, right) => {
				const leftActive = isActive(left.status);
				if (leftActive !== isActive(right.status)) return leftActive ? -1 : 1;
				if (leftActive) return left.startedAt - right.startedAt || left.displayName.localeCompare(right.displayName);
				const leftEnd = left.settledAt ?? left.startedAt;
				return (right.settledAt ?? right.startedAt) - leftEnd || right.startedAt - left.startedAt;
			});
		}
		function isAbort(error) {
			return error instanceof Error && error.name === "AbortError" || typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
		}
		function pageError(error) {
			if (error instanceof WorkflowRunsRemoteError && [
				"invalid-page-limit",
				"invalid-artifact-limit",
				"invalid-cursor",
				"stale-cursor"
			].includes(error.code)) return error.message;
			return GENERIC_LOAD_ERROR;
		}
		function utf8Bytes(value) {
			return new TextEncoder().encode(value).byteLength;
		}
		function settledMembers(run) {
			return run.memberCounts.completed + run.memberCounts.failed + run.memberCounts.cancelled;
		}
		function memberSummary(run, labels) {
			return labels.agentsCompact(settledMembers(run), run.memberCounts.total);
		}
		function budgetSummary(run) {
			return `${run.budget.spent}/${run.budget.total} agents`;
		}
		function terminalResult(run) {
			if (run.terminal === void 0) return "Result pending";
			if (run.terminal.preview !== void 0) return `Result: ${run.terminal.preview}`;
			switch (run.terminal.resultState) {
				case "available": return "Result retained";
				case "not-produced": return "No result produced";
				case "evicted": return "Result evicted";
			}
		}
		function groupMembers(members) {
			const groups = /* @__PURE__ */ new Map();
			for (const member of members) {
				const key = member.phase === void 0 ? "missing" : `value:${member.phase.length}:${member.phase}`;
				const group = groups.get(key);
				if (group === void 0) groups.set(key, {
					phase: member.phase,
					members: [member]
				});
				else group.members.push(member);
			}
			return [...groups].map(([key, group]) => ({
				key,
				...group
			}));
		}
		function appendItems(previous, next) {
			if (previous.revision !== next.revision) return void 0;
			return {
				...next,
				items: [...previous.items, ...next.items]
			};
		}
		/**
		* Join only a same-revision chunk beginning at the exact prior UTF-8 byte end.
		* Returning undefined forces the UI to preserve the good prefix and retry.
		*/
		function appendArtifactChunk(previous, next) {
			const expectedOffset = previous.offsetBytes + previous.returnedBytes;
			if (next.revision !== previous.revision || next.artifact.name !== previous.artifact.name || next.totalBytes !== previous.totalBytes || next.offsetBytes !== expectedOffset) return void 0;
			return {
				...next,
				text: previous.text + next.text,
				offsetBytes: previous.offsetBytes,
				returnedBytes: previous.returnedBytes + next.returnedBytes
			};
		}
		function editableTarget(target) {
			return target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=\"true\"]") !== null;
		}
		function focusable(root) {
			return [...root.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])")].filter((node) => {
				if (node.hidden || node.closest("[inert], [aria-hidden=\"true\"]") !== null) return false;
				if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return true;
				for (let current = node; current !== null && current !== root; current = current.parentElement) {
					const style = window.getComputedStyle(current);
					if (style.display === "none" || style.visibility === "hidden") return false;
				}
				return true;
			});
		}
		function runFromDetails(error) {
			const candidate = error.details?.run;
			if (typeof candidate !== "object" || candidate === null) return void 0;
			return candidate;
		}
		function ErrorRetry({ message, onRetry, disabled = false }) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: WorkflowsDashboard_module_css_default.error,
				role: "alert",
				children: [(0, react_jsx_runtime.jsx)("p", { children: message }), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled,
					onClick: onRetry,
					children: "Retry"
				})]
			});
		}
		function ResultView({ result }) {
			const outcome = result.value;
			if (outcome.state === "pending") return (0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Pending result" }), (0, react_jsx_runtime.jsx)("p", { children: "The workflow is still running." })] });
			if (outcome.state === "not-produced") return (0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsx)("h3", { children: "No final result produced" }), (0, react_jsx_runtime.jsx)("p", { children: "The workflow settled without a result." })] });
			if (outcome.state === "evicted") return (0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Final result evicted" }), (0, react_jsx_runtime.jsx)("p", { children: "The result was removed by retention." })] });
			if (outcome.state !== "available") return (0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Pending result" }), (0, react_jsx_runtime.jsx)("p", { children: "The workflow is still running." })] });
			const available = outcome;
			if (available.content.kind === "preview") return (0, react_jsx_runtime.jsxs)("section", { children: [
				(0, react_jsx_runtime.jsx)("h3", { children: "Truncated final result" }),
				(0, react_jsx_runtime.jsxs)("p", { children: [
					utf8Bytes(available.content.text),
					" bytes retained of ",
					available.totalBytes,
					" bytes total."
				] }),
				(0, react_jsx_runtime.jsx)("pre", {
					"aria-label": "Truncated final result preview",
					children: available.content.text
				})
			] });
			const value = available.content.value;
			if (typeof value === "string") return (0, react_jsx_runtime.jsxs)("section", { children: [
				(0, react_jsx_runtime.jsx)("h3", { children: "Final result" }),
				(0, react_jsx_runtime.jsx)("div", { children: value }),
				result.error !== void 0 && (0, react_jsx_runtime.jsx)("p", { children: result.error })
			] });
			let text = "[unavailable]";
			try {
				text = JSON.stringify(value, null, 2);
			} catch {}
			return (0, react_jsx_runtime.jsxs)("section", { children: [
				(0, react_jsx_runtime.jsx)("h3", { children: "Final result" }),
				(0, react_jsx_runtime.jsx)("pre", { children: text }),
				result.error !== void 0 && (0, react_jsx_runtime.jsx)("p", { children: result.error })
			] });
		}
		function PaneHeading({ title, onBack, backLabel }) {
			return (0, react_jsx_runtime.jsxs)("header", {
				className: WorkflowsDashboard_module_css_default.inspectorHeading,
				children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: WorkflowsDashboard_module_css_default.drilldownBack,
					onClick: onBack,
					children: backLabel
				}), (0, react_jsx_runtime.jsx)("h2", {
					tabIndex: -1,
					children: title
				})]
			});
		}
		/** Full-screen, lazy, revision-aware workflow dashboard. */
		function WorkflowsDashboard({ operations: suppliedOperations, controller, source: suppliedSource, sessionId, open: openProp = true, invoker, onClose, store, storeActions, labels: labelOverrides }) {
			const candidateOperations = suppliedOperations ?? controller;
			if (candidateOperations === void 0) throw new Error("workflow dashboard operations are unavailable");
			const operations = candidateOperations;
			const labels = labelOverrides ?? dashboardLabelsFromLocale(workflowLocales.en);
			const open = store === void 0 ? openProp : store.open;
			const rootRef = (0, react.useRef)(null);
			const openerRef = (0, react.useRef)(null);
			const onCloseRef = (0, react.useRef)(onClose);
			onCloseRef.current = onClose;
			const [source, setSource] = (0, react.useState)(() => suppliedSource ?? (sessionId === void 0 ? emptySource() : operations.get?.(sessionId) ?? emptySource(sessionId)));
			const [localRunId, setLocalRunId] = (0, react.useState)();
			const [localMobileView, setLocalMobileView] = (0, react.useState)("runs");
			const [localTab, setLocalTab] = (0, react.useState)("members");
			const [localMemberId, setLocalMemberId] = (0, react.useState)();
			const [localArtifact, setLocalArtifact] = (0, react.useState)();
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const [narrow, setNarrow] = (0, react.useState)(false);
			const selectedRunId = store?.selectedRunId ?? localRunId;
			const mobileView = store?.mobileView ?? localMobileView;
			const tab = store?.inspectorTab ?? localTab;
			const selectedMemberId = store?.selectedMemberId ?? localMemberId;
			const selectedArtifact = store?.selectedArtifactName ?? localArtifact;
			const [detail, setDetail] = (0, react.useState)({ phase: "idle" });
			const [members, setMembers] = (0, react.useState)({ phase: "idle" });
			const [memberDetail, setMemberDetail] = (0, react.useState)({ phase: "idle" });
			const [logs, setLogs] = (0, react.useState)({ phase: "idle" });
			const [result, setResult] = (0, react.useState)({ phase: "idle" });
			const [artifacts, setArtifacts] = (0, react.useState)({ phase: "idle" });
			const [artifactChunk, setArtifactChunk] = (0, react.useState)({ phase: "idle" });
			const [pendingControl, setPendingControl] = (0, react.useState)();
			const [controlFeedback, setControlFeedback] = (0, react.useState)();
			const [runPaging, setRunPaging] = (0, react.useState)(false);
			const [runPageError, setRunPageError] = (0, react.useState)();
			const readGeneration = (0, react.useRef)(0);
			const reads = (0, react.useRef)(/* @__PURE__ */ new Set());
			const selectedRunRef = (0, react.useRef)(void 0);
			const pendingControlRef = (0, react.useRef)(void 0);
			const controlAbortRef = (0, react.useRef)(void 0);
			const executeControlRef = (0, react.useRef)(() => void 0);
			const membersRef = (0, react.useRef)(members);
			membersRef.current = members;
			const logsRef = (0, react.useRef)(logs);
			logsRef.current = logs;
			const artifactsRef = (0, react.useRef)(artifacts);
			artifactsRef.current = artifacts;
			const chunkRef = (0, react.useRef)(artifactChunk);
			chunkRef.current = artifactChunk;
			(0, react.useEffect)(() => {
				if (suppliedSource !== void 0) setSource(suppliedSource);
			}, [suppliedSource]);
			(0, react.useEffect)(() => {
				if (suppliedSource !== void 0 || sessionId === void 0 || operations.subscribe === void 0) return;
				return operations.subscribe(sessionId, setSource);
			}, [
				operations,
				sessionId,
				suppliedSource
			]);
			(0, react.useEffect)(() => {
				operations.observe(open ? sessionId : void 0);
				return () => {
					operations.observe(void 0);
				};
			}, [
				open,
				operations,
				sessionId
			]);
			const rows = (0, react.useMemo)(() => orderWorkflowRuns(source.runs), [source.runs]);
			const activeRows = (0, react.useMemo)(() => rows.filter((run) => isActive(run.status)), [rows]);
			const historyRows = (0, react.useMemo)(() => rows.filter((run) => !isActive(run.status)), [rows]);
			const selectedRun = (selectedRunId === void 0 ? rows[0] : rows.find((run) => run.runId === selectedRunId)) ?? rows[0];
			selectedRunRef.current = selectedRun;
			const selectedKey = selectedRun?.runId;
			const visibleRunIds = (0, react.useMemo)(() => rows.map((run) => run.runId), [rows]);
			function selectRun(runId) {
				if (typeof storeActions?.selectRun === "function") storeActions.selectRun(runId);
				else {
					setLocalRunId(runId);
					setLocalMobileView("execution");
				}
			}
			function selectMember(memberId) {
				if (typeof storeActions?.selectMember === "function") storeActions.selectMember(memberId);
				else {
					setLocalMemberId(memberId);
					setLocalTab("members");
					setLocalMobileView("inspector");
				}
			}
			function selectArtifact(name) {
				if (typeof storeActions?.selectArtifact === "function") storeActions.selectArtifact(name);
				else {
					setLocalArtifact(name);
					setLocalTab("artifacts");
					setLocalMobileView("inspector");
				}
			}
			function selectTab(next) {
				if (typeof storeActions?.selectTab === "function") storeActions.selectTab(next);
				else {
					setLocalTab(next);
					setLocalMobileView(next === "members" ? "execution" : "inspector");
					if (next !== "members") setLocalMemberId(void 0);
					if (next !== "artifacts") setLocalArtifact(void 0);
				}
			}
			function showRuns() {
				if (typeof storeActions?.showRuns === "function") storeActions.showRuns();
				else setLocalMobileView("runs");
			}
			function showExecution() {
				if (typeof storeActions?.showExecution === "function") storeActions.showExecution();
				else setLocalMobileView("execution");
			}
			(0, react.useEffect)(() => {
				if (rows.length === 0) {
					if (typeof storeActions?.reconcileRun === "function" || typeof storeActions?.showRuns === "function") {
						if (selectedRunId !== void 0) storeActions.reconcileRun?.(void 0, []);
						if (store?.mobileView !== "runs") storeActions.showRuns?.();
					} else if (localRunId !== void 0 || localMobileView !== "runs") {
						setLocalRunId(void 0);
						setLocalMemberId(void 0);
						setLocalArtifact(void 0);
						setLocalMobileView("runs");
					}
					return;
				}
				if (selectedRunId === void 0 || !rows.some((run) => run.runId === selectedRunId)) {
					if (typeof storeActions?.reconcileRun === "function") storeActions.reconcileRun(selectedRunId, visibleRunIds);
					else {
						setLocalRunId(rows[0].runId);
						setLocalMemberId(void 0);
						setLocalArtifact(void 0);
					}
				}
			}, [
				localMobileView,
				localRunId,
				rows,
				selectedRunId,
				store?.mobileView,
				storeActions,
				visibleRunIds
			]);
			(0, react.useEffect)(() => {
				if (!open || activeRows.length === 0) return;
				setNow(Date.now());
				if (typeof window === "undefined") return;
				const timer = window.setInterval(() => {
					setNow(Date.now());
				}, 1e3);
				return () => {
					window.clearInterval(timer);
				};
			}, [activeRows.length, open]);
			(0, react.useEffect)(() => {
				if (!open || typeof window === "undefined") return;
				const onResize = () => {
					setNarrow(window.innerWidth < 1200);
				};
				onResize();
				window.addEventListener("resize", onResize);
				return () => {
					window.removeEventListener("resize", onResize);
				};
			}, [open]);
			function beginRead() {
				const abort = new AbortController();
				reads.current.add(abort);
				return abort;
			}
			function currentRead(token, abort) {
				return token === readGeneration.current && !abort.signal.aborted;
			}
			function endRead(abort) {
				reads.current.delete(abort);
			}
			function mergeRun(run) {
				setSource((previous) => {
					const index = previous.runs.findIndex((candidate) => candidate.runId === run.runId);
					if (index < 0) return previous;
					const current = previous.runs[index];
					if (run.revision < current.revision) return previous;
					const next = [...previous.runs];
					next[index] = run;
					return {
						...previous,
						runs: next,
						phase: "ready",
						status: "ready",
						error: void 0
					};
				});
			}
			function loadDetail(runId, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const abort = beginRead();
				setDetail((previous) => ({
					phase: "loading",
					value: previous.value
				}));
				operations.detail(sessionId, runId, abort.signal).then((value) => {
					if (!currentRead(token, abort)) return;
					setDetail({
						phase: "ready",
						value
					});
					mergeRun(value.run);
				}, (error) => {
					if (currentRead(token, abort) && !isAbort(error)) setDetail((previous) => ({
						phase: "error",
						value: previous.value,
						error: pageError(error)
					}));
				}).finally(() => {
					endRead(abort);
				});
			}
			function loadMembers(runId, cursor, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const previous = cursor === void 0 ? void 0 : membersRef.current.value;
				const abort = beginRead();
				if (previous === void 0) setMembers({ phase: "loading" });
				else setMembers({
					phase: "ready",
					value: previous,
					paging: true
				});
				operations.members(sessionId, runId, cursor, abort.signal).then((page) => {
					if (!currentRead(token, abort)) return;
					if (previous === void 0) setMembers({
						phase: "ready",
						value: page
					});
					else {
						const joined = appendItems(previous, page);
						setMembers(joined === void 0 ? {
							phase: "ready",
							value: previous,
							pageError: GENERIC_LOAD_ERROR
						} : {
							phase: "ready",
							value: joined
						});
					}
				}, (error) => {
					if (!currentRead(token, abort) || isAbort(error)) return;
					const message = pageError(error);
					setMembers(previous === void 0 ? {
						phase: "error",
						error: message
					} : {
						phase: "ready",
						value: previous,
						pageError: message
					});
				}).finally(() => {
					endRead(abort);
				});
			}
			function loadMemberDetail(runId, memberId, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const abort = beginRead();
				setMemberDetail({ phase: "loading" });
				operations.memberDetail(sessionId, runId, memberId, abort.signal).then((value) => {
					if (currentRead(token, abort)) setMemberDetail({
						phase: "ready",
						value
					});
				}, (error) => {
					if (currentRead(token, abort) && !isAbort(error)) setMemberDetail({
						phase: "error",
						error: GENERIC_LOAD_ERROR
					});
				}).finally(() => {
					endRead(abort);
				});
			}
			function loadLogs(runId, cursor, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const previous = cursor === void 0 ? void 0 : logsRef.current.value;
				const abort = beginRead();
				if (previous === void 0) setLogs({ phase: "loading" });
				else setLogs({
					phase: "ready",
					value: previous,
					paging: true
				});
				operations.logs(sessionId, runId, cursor, abort.signal).then((page) => {
					if (!currentRead(token, abort)) return;
					if (previous === void 0) setLogs({
						phase: "ready",
						value: page
					});
					else {
						const joined = appendItems(previous, page);
						setLogs(joined === void 0 ? {
							phase: "ready",
							value: previous,
							pageError: GENERIC_LOAD_ERROR
						} : {
							phase: "ready",
							value: joined
						});
					}
				}, (error) => {
					if (!currentRead(token, abort) || isAbort(error)) return;
					const message = pageError(error);
					setLogs(previous === void 0 ? {
						phase: "error",
						error: message
					} : {
						phase: "ready",
						value: previous,
						pageError: message
					});
				}).finally(() => {
					endRead(abort);
				});
			}
			function loadResult(runId, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const abort = beginRead();
				setResult((previous) => ({
					phase: "loading",
					value: previous.value
				}));
				operations.result(sessionId, runId, abort.signal).then((value) => {
					if (currentRead(token, abort)) setResult({
						phase: "ready",
						value
					});
				}, (error) => {
					if (currentRead(token, abort) && !isAbort(error)) setResult((previous) => ({
						phase: "error",
						value: previous.value,
						error: pageError(error)
					}));
				}).finally(() => {
					endRead(abort);
				});
			}
			function loadArtifacts(runId, cursor, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const previous = cursor === void 0 ? void 0 : artifactsRef.current.value;
				const abort = beginRead();
				if (previous === void 0) setArtifacts({ phase: "loading" });
				else setArtifacts({
					phase: "ready",
					value: previous,
					paging: true
				});
				operations.artifacts(sessionId, runId, cursor, abort.signal).then((page) => {
					if (!currentRead(token, abort)) return;
					if (previous === void 0) setArtifacts({
						phase: "ready",
						value: page
					});
					else {
						const joined = appendItems(previous, page);
						setArtifacts(joined === void 0 ? {
							phase: "ready",
							value: previous,
							pageError: GENERIC_LOAD_ERROR
						} : {
							phase: "ready",
							value: joined
						});
					}
				}, (error) => {
					if (!currentRead(token, abort) || isAbort(error)) return;
					const message = pageError(error);
					setArtifacts(previous === void 0 ? {
						phase: "error",
						error: message
					} : {
						phase: "ready",
						value: previous,
						pageError: message
					});
				}).finally(() => {
					endRead(abort);
				});
			}
			function loadArtifact(runId, name, cursor, token = readGeneration.current) {
				if (sessionId === void 0) return;
				const previous = cursor === void 0 ? void 0 : chunkRef.current.value;
				const expectedRevision = artifactsRef.current.value?.revision;
				const abort = beginRead();
				if (previous === void 0) setArtifactChunk({ phase: "loading" });
				else setArtifactChunk({
					phase: "ready",
					value: previous,
					paging: true
				});
				operations.artifact(sessionId, runId, name, cursor, expectedRevision, abort.signal).then((chunk) => {
					if (!currentRead(token, abort)) return;
					if (previous === void 0) {
						if (chunk.offsetBytes !== 0) setArtifactChunk({
							phase: "error",
							error: GENERIC_LOAD_ERROR
						});
						else setArtifactChunk({
							phase: "ready",
							value: chunk
						});
					} else {
						const joined = appendArtifactChunk(previous, chunk);
						setArtifactChunk(joined === void 0 ? {
							phase: "ready",
							value: previous,
							pageError: GENERIC_LOAD_ERROR
						} : {
							phase: "ready",
							value: joined
						});
					}
				}, (error) => {
					if (!currentRead(token, abort) || isAbort(error)) return;
					const message = pageError(error);
					setArtifactChunk(previous === void 0 ? {
						phase: "error",
						error: message
					} : {
						phase: "ready",
						value: previous,
						pageError: message
					});
				}).finally(() => {
					endRead(abort);
				});
			}
			(0, react.useEffect)(() => {
				const token = ++readGeneration.current;
				for (const request of reads.current) request.abort("workflow selection changed");
				reads.current.clear();
				setDetail({ phase: "idle" });
				setMembers({ phase: "idle" });
				setMemberDetail({ phase: "idle" });
				setLogs({ phase: "idle" });
				setResult({ phase: "idle" });
				setArtifacts({ phase: "idle" });
				setArtifactChunk({ phase: "idle" });
				if (storeActions === void 0) {
					setLocalMemberId(void 0);
					setLocalArtifact(void 0);
					setLocalTab("members");
				}
				controlAbortRef.current?.abort("workflow selection changed");
				controlAbortRef.current = void 0;
				pendingControlRef.current = void 0;
				setPendingControl(void 0);
				setControlFeedback(void 0);
				if (open && selectedKey !== void 0 && sessionId !== void 0) {
					loadDetail(selectedKey, token);
					loadMembers(selectedKey, void 0, token);
				}
				return () => {
					if (readGeneration.current !== token) return;
					for (const request of reads.current) request.abort("workflow selection changed");
					reads.current.clear();
				};
			}, [
				open,
				operations,
				selectedKey,
				sessionId
			]);
			(0, react.useEffect)(() => {
				if (!open || selectedKey === void 0) return;
				if (tab === "logs" && logs.phase === "idle") loadLogs(selectedKey);
				else if (tab === "result" && result.phase === "idle") loadResult(selectedKey);
				else if (tab === "artifacts" && artifacts.phase === "idle") loadArtifacts(selectedKey);
			}, [
				artifacts.phase,
				logs.phase,
				open,
				result.phase,
				selectedKey,
				tab
			]);
			(0, react.useEffect)(() => {
				if (!open || selectedKey === void 0 || selectedMemberId === void 0) return;
				loadMemberDetail(selectedKey, selectedMemberId);
			}, [
				open,
				selectedKey,
				selectedMemberId
			]);
			(0, react.useEffect)(() => {
				if (!open || selectedKey === void 0 || selectedArtifact === void 0) return;
				setArtifactChunk({ phase: "idle" });
				loadArtifact(selectedKey, selectedArtifact);
			}, [
				open,
				selectedArtifact,
				selectedKey,
				artifacts.value?.revision
			]);
			(0, react.useEffect)(() => () => {
				++readGeneration.current;
				for (const request of reads.current) request.abort("workflow dashboard disposed");
				reads.current.clear();
				controlAbortRef.current?.abort("workflow dashboard disposed");
			}, []);
			function executeControl(action) {
				const run = selectedRunRef.current;
				if (sessionId === void 0 || run === void 0 || pendingControlRef.current !== void 0) return;
				if (!run.allowedActions.includes(action)) return;
				const abort = new AbortController();
				controlAbortRef.current?.abort("workflow control superseded");
				controlAbortRef.current = abort;
				pendingControlRef.current = action;
				setPendingControl(action);
				setControlFeedback(void 0);
				operations.control(sessionId, run.runId, action, run.revision, abort.signal).then((value) => {
					if (abort.signal.aborted || controlAbortRef.current !== abort) return;
					mergeRun(value.run);
					setControlFeedback({
						kind: "notice",
						message: `${labels[action]} requested for ${value.run.displayName}.`
					});
				}, (error) => {
					if (abort.signal.aborted || controlAbortRef.current !== abort || isAbort(error)) return;
					if (error instanceof WorkflowRunsRemoteError) {
						const authoritative = runFromDetails(error);
						if (authoritative !== void 0) mergeRun(authoritative);
						if (error.code === "revision-conflict") {
							setControlFeedback({
								kind: "error",
								message: STALE_CONTROL_ERROR
							});
							return;
						}
						if (error.code === "action-unavailable" && error.details?.reason === "budget-limited" && action === "resume") {
							const displayName = authoritative?.displayName ?? run.displayName;
							setControlFeedback({
								kind: "error",
								message: `workflow "${displayName}" requires a higher agent_budget to resume`
							});
							return;
						}
					}
					setControlFeedback({
						kind: "error",
						message: GENERIC_CONTROL_ERROR,
						retryAction: action
					});
				}).finally(() => {
					if (controlAbortRef.current !== abort) return;
					controlAbortRef.current = void 0;
					pendingControlRef.current = void 0;
					setPendingControl(void 0);
				});
			}
			executeControlRef.current = executeControl;
			function loadMoreRuns() {
				if (sessionId === void 0 || source.nextCursor === void 0 || runPaging) return;
				setRunPaging(true);
				setRunPageError(void 0);
				operations.loadMore(sessionId).then(() => {
					setRunPageError(void 0);
				}, (error) => {
					if (!isAbort(error)) setRunPageError(pageError(error));
				}).finally(() => {
					setRunPaging(false);
				});
			}
			(0, react.useEffect)(() => {
				if (!open) return;
				openerRef.current = invoker ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
				const root = rootRef.current;
				if (root === null) return;
				const overlayLayer = root.closest("[data-shell-overlay]") ?? root;
				const parent = overlayLayer.parentElement;
				const siblings = parent === null ? [] : [...parent.children].filter((node) => node instanceof HTMLElement && node !== overlayLayer).map((element) => ({
					element,
					inert: element.getAttribute("inert"),
					ariaHidden: element.getAttribute("aria-hidden")
				}));
				for (const { element } of siblings) {
					element.setAttribute("inert", "");
					element.setAttribute("aria-hidden", "true");
				}
				root.focus();
				const recoverFocus = (event) => {
					if (event.target instanceof Node && (event.target === root || root.contains(event.target))) return;
					(focusable(root)[0] ?? root).focus();
				};
				const onKey = (event) => {
					if (!(event.target instanceof Node) || event.target !== root && !root.contains(event.target)) return;
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						onCloseRef.current?.();
						return;
					}
					if (event.key === "Tab") {
						const targets = focusable(root);
						if (targets.length === 0) {
							event.preventDefault();
							root.focus();
							return;
						}
						const first = targets[0];
						const last = targets.at(-1);
						if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
							event.preventDefault();
							last?.focus();
						} else if (!event.shiftKey && document.activeElement === last) {
							event.preventDefault();
							first?.focus();
						}
						return;
					}
					if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat || editableTarget(event.target)) return;
					const action = SHORTCUTS[event.key.toLowerCase()];
					const run = selectedRunRef.current;
					if (action === void 0 || run === void 0 || !run.allowedActions.includes(action)) return;
					event.preventDefault();
					executeControlRef.current(action);
				};
				document.addEventListener("focusin", recoverFocus, true);
				document.addEventListener("keydown", onKey, true);
				return () => {
					document.removeEventListener("focusin", recoverFocus, true);
					document.removeEventListener("keydown", onKey, true);
					for (const { element, inert, ariaHidden } of siblings) {
						if (inert === null) element.removeAttribute("inert");
						else element.setAttribute("inert", inert);
						if (ariaHidden === null) element.removeAttribute("aria-hidden");
						else element.setAttribute("aria-hidden", ariaHidden);
					}
					if (openerRef.current?.isConnected === true) openerRef.current.focus();
					openerRef.current = null;
				};
			}, [invoker, open]);
			(0, react.useEffect)(() => {
				if (!open || !narrow) return;
				const root = rootRef.current;
				if (root === null) return;
				let target;
				if (mobileView === "runs") target = [...root.querySelectorAll("[data-workflow-run-id]")].find((element) => element.dataset.workflowRunId === selectedKey);
				else if (mobileView === "execution") target = [...root.querySelectorAll("[data-workflow-member-id]")].find((element) => element.dataset.workflowMemberId === selectedMemberId) ?? [...root.querySelectorAll("[data-workflow-output-tab]")].find((element) => element.dataset.workflowOutputTab === tab) ?? root.querySelector("#workflow-run-heading");
				else target = root.querySelector("[role=\"tab\"][aria-selected=\"true\"]") ?? root.querySelector("[data-pane=\"inspector\"] h2");
				target?.focus();
			}, [
				mobileView,
				narrow,
				open,
				selectedKey,
				selectedMemberId,
				tab
			]);
			if (!open) return null;
			const memberRows = members.value?.items ?? [];
			const currentMember = memberRows.find((member) => member.memberId === selectedMemberId);
			const execution = detail.value;
			const renderPageError = (state, retry) => state.pageError === void 0 ? null : (0, react_jsx_runtime.jsx)(ErrorRetry, {
				message: state.pageError,
				onRetry: retry,
				disabled: state.paging
			});
			const logsPane = () => {
				if (logs.phase === "loading" && logs.value === void 0) return (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					children: "Loading logs…"
				});
				if (logs.phase === "error" && logs.value === void 0) return (0, react_jsx_runtime.jsx)(ErrorRetry, {
					message: logs.error ?? "Unable to load workflow data. Retry.",
					onRetry: () => selectedKey !== void 0 && loadLogs(selectedKey)
				});
				const page = logs.value;
				if (page === void 0) return (0, react_jsx_runtime.jsx)("p", { children: "Logs load on demand." });
				return (0, react_jsx_runtime.jsxs)("div", {
					className: WorkflowsDashboard_module_css_default.paneContents,
					children: [
						page.items.length === 0 && page.evicted === 0 && (0, react_jsx_runtime.jsx)("p", { children: labels.noLogLines }),
						page.items.length === 0 && page.evicted > 0 && (0, react_jsx_runtime.jsx)("p", { children: labels.noRetainedLogLines }),
						page.evicted > 0 && page.items.length > 0 && (0, react_jsx_runtime.jsxs)("p", { children: [page.evicted, " earlier log lines were evicted by retention."] }),
						page.items.map((line) => (0, react_jsx_runtime.jsxs)("p", {
							className: WorkflowsDashboard_module_css_default.logLine,
							children: [(0, react_jsx_runtime.jsx)("code", { children: line.index }), (0, react_jsx_runtime.jsx)("span", { children: line.text })]
						}, line.index)),
						(0, react_jsx_runtime.jsxs)("p", {
							className: WorkflowsDashboard_module_css_default.retention,
							children: [
								"Loaded ",
								page.items.length,
								" of ",
								page.total,
								" retained log lines."
							]
						}),
						page.nextCursor !== void 0 && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: logs.paging,
							onClick: () => selectedKey !== void 0 && loadLogs(selectedKey, page.nextCursor),
							children: logs.paging ? "Loading…" : "Load more logs"
						}),
						renderPageError(logs, () => selectedKey !== void 0 && page.nextCursor !== void 0 && loadLogs(selectedKey, page.nextCursor))
					]
				});
			};
			const resultPane = () => {
				if (result.phase === "loading" && result.value === void 0) return (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					children: "Loading final result…"
				});
				if (result.phase === "error" && result.value === void 0) return (0, react_jsx_runtime.jsx)(ErrorRetry, {
					message: result.error ?? "Unable to load workflow data. Retry.",
					onRetry: () => selectedKey !== void 0 && loadResult(selectedKey)
				});
				return result.value === void 0 ? (0, react_jsx_runtime.jsx)("p", { children: "Final result loads on demand." }) : (0, react_jsx_runtime.jsxs)("div", {
					className: WorkflowsDashboard_module_css_default.paneContents,
					children: [(0, react_jsx_runtime.jsx)(ResultView, { result: result.value }), result.phase === "error" && (0, react_jsx_runtime.jsx)(ErrorRetry, {
						message: result.error ?? "Unable to load workflow data. Retry.",
						onRetry: () => selectedKey !== void 0 && loadResult(selectedKey)
					})]
				});
			};
			const artifactPane = () => {
				if (artifacts.phase === "loading" && artifacts.value === void 0) return (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					children: "Loading scratch artifacts…"
				});
				if (artifacts.phase === "error" && artifacts.value === void 0) return (0, react_jsx_runtime.jsx)(ErrorRetry, {
					message: artifacts.error ?? "Unable to load workflow data. Retry.",
					onRetry: () => selectedKey !== void 0 && loadArtifacts(selectedKey)
				});
				const page = artifacts.value;
				if (page === void 0) return (0, react_jsx_runtime.jsx)("p", { children: "Scratch artifacts load on demand." });
				return (0, react_jsx_runtime.jsxs)("div", {
					className: WorkflowsDashboard_module_css_default.paneContents,
					children: [
						page.items.length === 0 && page.omitted === 0 && (0, react_jsx_runtime.jsx)("p", { children: "No scratch artifacts were produced." }),
						page.items.length === 0 && page.omitted > 0 && (0, react_jsx_runtime.jsx)("p", { children: "All artifact names were omitted by retention." }),
						page.omitted > 0 && page.items.length > 0 && (0, react_jsx_runtime.jsxs)("p", { children: [page.omitted, " artifact names were omitted by retention."] }),
						(0, react_jsx_runtime.jsx)("div", {
							className: WorkflowsDashboard_module_css_default.artifactList,
							children: page.items.map((item) => (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								"aria-pressed": selectedArtifact === item.name,
								onClick: () => selectArtifact(item.name),
								children: [(0, react_jsx_runtime.jsx)("span", { children: item.name }), (0, react_jsx_runtime.jsxs)("span", { children: [item.bytes, " bytes"] })]
							}, item.name))
						}),
						(0, react_jsx_runtime.jsxs)("p", {
							className: WorkflowsDashboard_module_css_default.retention,
							children: [
								"Loaded ",
								page.items.length,
								" of ",
								page.total,
								" retained artifact names."
							]
						}),
						page.nextCursor !== void 0 && (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: artifacts.paging,
							onClick: () => selectedKey !== void 0 && loadArtifacts(selectedKey, page.nextCursor),
							children: artifacts.paging ? "Loading…" : "Load more artifacts"
						}),
						renderPageError(artifacts, () => selectedKey !== void 0 && page.nextCursor !== void 0 && loadArtifacts(selectedKey, page.nextCursor)),
						selectedArtifact !== void 0 && (0, react_jsx_runtime.jsxs)("section", {
							className: WorkflowsDashboard_module_css_default.artifactViewer,
							"aria-label": `Artifact ${selectedArtifact}`,
							children: [
								(0, react_jsx_runtime.jsx)("h3", { children: selectedArtifact }),
								artifactChunk.phase === "loading" && artifactChunk.value === void 0 && (0, react_jsx_runtime.jsx)("p", {
									role: "status",
									children: "Loading artifact…"
								}),
								artifactChunk.phase === "error" && artifactChunk.value === void 0 && (0, react_jsx_runtime.jsx)(ErrorRetry, {
									message: artifactChunk.error ?? "Unable to load workflow data. Retry.",
									onRetry: () => selectedKey !== void 0 && loadArtifact(selectedKey, selectedArtifact)
								}),
								artifactChunk.value !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsx)("pre", { children: artifactChunk.value.text }),
									(0, react_jsx_runtime.jsxs)("p", {
										className: WorkflowsDashboard_module_css_default.retention,
										children: [
											artifactChunk.value.returnedBytes,
											" of ",
											artifactChunk.value.totalBytes,
											" bytes loaded."
										]
									}),
									artifactChunk.value.nextCursor !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										disabled: artifactChunk.paging,
										onClick: () => selectedKey !== void 0 && loadArtifact(selectedKey, selectedArtifact, artifactChunk.value?.nextCursor),
										children: artifactChunk.paging ? "Loading…" : "Load more artifact content"
									}),
									renderPageError(artifactChunk, () => selectedKey !== void 0 && artifactChunk.value?.nextCursor !== void 0 && loadArtifact(selectedKey, selectedArtifact, artifactChunk.value.nextCursor))
								] })
							]
						})
					]
				});
			};
			const inspectorPane = () => {
				if (tab === "logs") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(PaneHeading, {
					title: "Logs",
					onBack: showExecution,
					backLabel: labels.backExecution
				}), logsPane()] });
				if (tab === "result") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(PaneHeading, {
					title: "Final result",
					onBack: showExecution,
					backLabel: labels.backExecution
				}), resultPane()] });
				if (tab === "artifacts") return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(PaneHeading, {
					title: "Scratch artifacts",
					onBack: showExecution,
					backLabel: labels.backExecution
				}), artifactPane()] });
				if (selectedMemberId === void 0) return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(PaneHeading, {
					title: "Member outcome",
					onBack: showExecution,
					backLabel: labels.backExecution
				}), (0, react_jsx_runtime.jsx)("p", { children: "Select a member to inspect its outcome." })] });
				return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: WorkflowsDashboard_module_css_default.drilldownBack,
					onClick: showExecution,
					children: labels.backExecution
				}), (0, react_jsx_runtime.jsx)(WorkflowMemberInspector, {
					member: currentMember,
					detail: memberDetail.value,
					loading: memberDetail.phase === "loading",
					error: memberDetail.phase === "error" ? memberDetail.error : void 0,
					onRetry: () => selectedKey !== void 0 && loadMemberDetail(selectedKey, selectedMemberId),
					labels,
					onOpenChild: memberDetail.value?.childSessionId === void 0 || sessionId === void 0 ? void 0 : () => operations.resolveAndOpenChild(sessionId, memberDetail.value.childSessionId)
				})] });
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: clsx(WorkflowsDashboard_module_css_default.dashboard),
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "workflow-dashboard-title",
				tabIndex: -1,
				"data-workflows-dashboard": true,
				"data-mobile-view": mobileView,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: clsx(WorkflowsDashboard_module_css_default.header),
						children: [
							(0, react_jsx_runtime.jsxs)("div", {
								className: WorkflowsDashboard_module_css_default.headerCopy,
								children: [
									(0, react_jsx_runtime.jsx)("p", {
										className: WorkflowsDashboard_module_css_default.eyebrow,
										children: "Background orchestration"
									}),
									(0, react_jsx_runtime.jsx)("h1", {
										id: "workflow-dashboard-title",
										children: labels.title
									}),
									(0, react_jsx_runtime.jsxs)("p", {
										className: WorkflowsDashboard_module_css_default.topSummary,
										children: [
											activeRows.length,
											" active · ",
											rows.length,
											" loaded of ",
											source.total,
											" runs"
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsx)("p", {
								className: WorkflowsDashboard_module_css_default.kbdHint,
								children: labels.kbdHint
							}),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: WorkflowsDashboard_module_css_default.close,
								onClick: () => onCloseRef.current?.(),
								"aria-label": labels.close,
								children: "Close"
							})
						]
					}),
					source.phase === "reconnecting" && rows.length > 0 && (0, react_jsx_runtime.jsx)("p", {
						className: WorkflowsDashboard_module_css_default.notice,
						role: "status",
						children: labels.reconnecting
					}),
					source.phase === "loading" && rows.length === 0 && (0, react_jsx_runtime.jsx)("p", {
						className: WorkflowsDashboard_module_css_default.notice,
						role: "status",
						children: labels.loading
					}),
					source.phase === "error" && rows.length === 0 && (0, react_jsx_runtime.jsx)(ErrorRetry, {
						message: "Unable to load workflow data. Retry.",
						onRetry: () => {
							if (sessionId !== void 0) operations.refresh(sessionId).catch(() => void 0);
						}
					}),
					source.phase === "reconnecting" && rows.length === 0 && (0, react_jsx_runtime.jsx)("p", {
						className: WorkflowsDashboard_module_css_default.notice,
						role: "status",
						children: labels.reconnecting
					}),
					source.phase === "error" && rows.length > 0 && runPageError === void 0 && (0, react_jsx_runtime.jsx)(ErrorRetry, {
						message: "Unable to load workflow data. Retry.",
						onRetry: () => {
							if (sessionId !== void 0) operations.refresh(sessionId).catch(() => void 0);
						}
					}),
					rows.length === 0 && source.phase !== "loading" && source.phase !== "error" && source.phase !== "reconnecting" ? (0, react_jsx_runtime.jsxs)("main", {
						className: WorkflowsDashboard_module_css_default.empty,
						children: [(0, react_jsx_runtime.jsx)("h2", { children: labels.emptyTitle }), (0, react_jsx_runtime.jsx)("p", { children: labels.emptyBody })]
					}) : rows.length === 0 ? null : (0, react_jsx_runtime.jsxs)("div", {
						className: WorkflowsDashboard_module_css_default.layout,
						children: [
							(0, react_jsx_runtime.jsxs)("nav", {
								className: WorkflowsDashboard_module_css_default.navigator,
								"aria-label": "Workflow runs",
								"data-pane": "navigator",
								children: [
									(0, react_jsx_runtime.jsxs)("section", {
										className: WorkflowsDashboard_module_css_default.runGroup,
										"aria-labelledby": "active-workflows-heading",
										children: [
											(0, react_jsx_runtime.jsxs)("h2", {
												id: "active-workflows-heading",
												children: ["Active · ", activeRows.length]
											}),
											activeRows.length === 0 && (0, react_jsx_runtime.jsx)("p", {
												className: WorkflowsDashboard_module_css_default.groupEmpty,
												children: "No active runs"
											}),
											activeRows.map((run) => (0, react_jsx_runtime.jsx)(RunRow, {
												run,
												selected: run.runId === selectedKey,
												labels,
												now,
												onSelect: () => selectRun(run.runId)
											}, run.runId))
										]
									}),
									(0, react_jsx_runtime.jsxs)("section", {
										className: WorkflowsDashboard_module_css_default.runGroup,
										"aria-labelledby": "workflow-history-heading",
										children: [
											(0, react_jsx_runtime.jsxs)("h2", {
												id: "workflow-history-heading",
												children: ["History · ", historyRows.length]
											}),
											historyRows.length === 0 && (0, react_jsx_runtime.jsx)("p", {
												className: WorkflowsDashboard_module_css_default.groupEmpty,
												children: "No settled runs"
											}),
											historyRows.map((run) => (0, react_jsx_runtime.jsx)(RunRow, {
												run,
												selected: run.runId === selectedKey,
												labels,
												now,
												onSelect: () => selectRun(run.runId)
											}, run.runId))
										]
									}),
									(0, react_jsx_runtime.jsxs)("footer", {
										className: WorkflowsDashboard_module_css_default.navigatorFooter,
										children: [
											(0, react_jsx_runtime.jsxs)("p", { children: [
												rows.length,
												" loaded of ",
												source.total,
												" runs"
											] }),
											source.nextCursor !== void 0 && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: runPaging,
												onClick: loadMoreRuns,
												children: runPaging ? "Loading…" : "Load more runs"
											}),
											runPageError !== void 0 && (0, react_jsx_runtime.jsx)(ErrorRetry, {
												message: runPageError,
												onRetry: loadMoreRuns,
												disabled: runPaging
											})
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("main", {
								className: WorkflowsDashboard_module_css_default.detail,
								"aria-live": "polite",
								"data-pane": "execution",
								children: [(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: WorkflowsDashboard_module_css_default.drilldownBack,
									onClick: showRuns,
									children: labels.backRuns
								}), selectedRun === void 0 ? (0, react_jsx_runtime.jsx)("p", { children: "Select a run to inspect its progress." }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(0, react_jsx_runtime.jsxs)("header", {
										className: WorkflowsDashboard_module_css_default.executionHeader,
										children: [(0, react_jsx_runtime.jsxs)("div", { children: [
											(0, react_jsx_runtime.jsx)("p", {
												className: WorkflowsDashboard_module_css_default.eyebrow,
												children: statusLabel(selectedRun.status, labels)
											}),
											(0, react_jsx_runtime.jsx)("h2", {
												id: "workflow-run-heading",
												tabIndex: -1,
												children: selectedRun.displayName
											}),
											(0, react_jsx_runtime.jsx)("p", { children: selectedRun.description }),
											(0, react_jsx_runtime.jsx)("p", {
												className: WorkflowsDashboard_module_css_default.muted,
												children: formatDuration((selectedRun.settledAt ?? now) - selectedRun.startedAt)
											})
										] }), (0, react_jsx_runtime.jsx)("div", {
											className: WorkflowsDashboard_module_css_default.actions,
											"aria-label": `Controls for ${selectedRun.displayName}`,
											children: ACTION_ORDER.filter((action) => selectedRun.allowedActions.includes(action)).map((action) => (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: pendingControl !== void 0,
												onClick: () => executeControl(action),
												children: labels[action]
											}, action))
										})]
									}),
									controlFeedback !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
										className: controlFeedback.kind === "error" ? WorkflowsDashboard_module_css_default.error : WorkflowsDashboard_module_css_default.feedback,
										role: controlFeedback.kind === "error" ? "alert" : "status",
										children: [(0, react_jsx_runtime.jsx)("p", { children: controlFeedback.message }), controlFeedback.retryAction !== void 0 && (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: pendingControl !== void 0,
											onClick: () => executeControl(controlFeedback.retryAction),
											children: "Retry"
										})]
									}),
									selectedRun.status === "budget-limited" && (0, react_jsx_runtime.jsxs)("aside", {
										className: WorkflowsDashboard_module_css_default.callout,
										role: "note",
										children: [(0, react_jsx_runtime.jsx)("strong", { children: labels.budgetLimitTitle }), (0, react_jsx_runtime.jsx)("span", { children: labels.budgetLimitBody })]
									}),
									selectedRun.status === "interrupted" && (0, react_jsx_runtime.jsx)("p", {
										className: WorkflowsDashboard_module_css_default.notice,
										role: "status",
										children: labels.interruptedSettlement
									}),
									(0, react_jsx_runtime.jsxs)("dl", {
										className: WorkflowsDashboard_module_css_default.facts,
										children: [
											(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Status" }), (0, react_jsx_runtime.jsx)("dd", { children: statusLabel(execution?.run.status ?? selectedRun.status, labels) })] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Live phase" }), (0, react_jsx_runtime.jsxs)("dd", { children: [(0, react_jsx_runtime.jsx)("code", { children: execution?.run.phase ?? selectedRun.phase ?? labels.noPhaseYet }), (execution?.run.phase ?? selectedRun.phase) === "" && (0, react_jsx_runtime.jsx)("span", {
												className: WorkflowsDashboard_module_css_default.muted,
												children: " empty string"
											})] })] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Agent budget" }), (0, react_jsx_runtime.jsxs)("dd", { children: [
												selectedRun.budget.spent,
												"/",
												selectedRun.budget.total,
												" spent · ",
												selectedRun.budget.remaining,
												" remaining"
											] })] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Members" }), (0, react_jsx_runtime.jsx)("dd", { children: memberSummary(selectedRun, labels) })] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Stop reason" }), (0, react_jsx_runtime.jsx)("dd", { children: selectedRun.terminal?.stopReason ?? "—" })] }),
											(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Result" }), (0, react_jsx_runtime.jsx)("dd", { children: terminalResult(selectedRun) })] }),
											selectedRun.terminal?.error !== void 0 && selectedRun.terminal.error !== "Process exited before workflow settlement." && (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: "Error" }), (0, react_jsx_runtime.jsx)("dd", { children: selectedRun.terminal.error })] })
										]
									}),
									detail.phase === "loading" && detail.value === void 0 && (0, react_jsx_runtime.jsx)("p", {
										role: "status",
										children: "Loading run detail…"
									}),
									detail.phase === "error" && (0, react_jsx_runtime.jsx)(ErrorRetry, {
										message: detail.error ?? "Unable to load workflow data. Retry.",
										onRetry: () => loadDetail(selectedRun.runId)
									}),
									(0, react_jsx_runtime.jsxs)("section", {
										"aria-labelledby": "declared-phases-heading",
										children: [
											(0, react_jsx_runtime.jsx)("h3", {
												id: "declared-phases-heading",
												children: "Declared phases"
											}),
											(0, react_jsx_runtime.jsx)("ol", {
												className: WorkflowsDashboard_module_css_default.phaseRail,
												children: (execution?.phases ?? []).map((phase, index) => {
													const live = execution?.run.phase ?? selectedRun.phase;
													const current = live !== void 0 && phase.title === live;
													const currentIndex = live === void 0 ? -1 : (execution?.phases ?? []).findIndex((item) => item.title === live);
													const reached = currentIndex >= 0 && index < currentIndex;
													return (0, react_jsx_runtime.jsxs)("li", {
														"data-current": current ? "true" : "false",
														title: phase.title,
														children: [
															(0, react_jsx_runtime.jsx)("strong", { children: phase.title }),
															phase.detail !== void 0 && (0, react_jsx_runtime.jsx)("span", { children: phase.detail }),
															(phase.provider !== void 0 || phase.model !== void 0) && (0, react_jsx_runtime.jsx)("small", { children: [phase.provider, phase.model].filter(Boolean).join(" · ") }),
															(0, react_jsx_runtime.jsx)("small", { children: current ? labels.livePhaseCurrent : reached ? labels.livePhaseReached : labels.livePhaseUpcoming })
														]
													}, `${index}:${phase.title}`);
												})
											}),
											execution !== void 0 && (execution.phases?.length ?? 0) === 0 && (0, react_jsx_runtime.jsx)("p", { children: "No declared phases." })
										]
									}),
									execution?.gate !== void 0 && (0, react_jsx_runtime.jsxs)("p", {
										className: WorkflowsDashboard_module_css_default.notice,
										children: ["Waiting for input: ", execution.gate.message]
									}),
									execution?.error !== void 0 && (0, react_jsx_runtime.jsxs)("p", {
										className: WorkflowsDashboard_module_css_default.errorText,
										children: ["Retained error: ", execution.error]
									}),
									(0, react_jsx_runtime.jsx)("div", {
										className: WorkflowsDashboard_module_css_default.tabs,
										role: "tablist",
										"aria-label": "Workflow execution details",
										children: [
											"members",
											"logs",
											"result",
											"artifacts"
										].map((value) => (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											role: "tab",
											"aria-selected": tab === value,
											"data-workflow-output-tab": value,
											onClick: () => selectTab(value),
											children: value === "members" ? "Members" : value === "logs" ? "Logs" : value === "result" ? "Result" : "Artifacts"
										}, value))
									}),
									tab === "members" && (0, react_jsx_runtime.jsxs)("section", {
										className: WorkflowsDashboard_module_css_default.members,
										"aria-label": "Workflow members",
										children: [
											members.phase === "loading" && members.value === void 0 && (0, react_jsx_runtime.jsx)("p", {
												role: "status",
												children: "Loading members…"
											}),
											members.phase === "error" && members.value === void 0 && (0, react_jsx_runtime.jsx)(ErrorRetry, {
												message: members.error ?? "Unable to load workflow data. Retry.",
												onRetry: () => loadMembers(selectedRun.runId)
											}),
											groupMembers(memberRows).map((group) => {
												const groupLabel = group.phase === void 0 ? labels.unphased : group.phase === "" ? labels.emptyPhase : group.phase;
												return (0, react_jsx_runtime.jsxs)("section", {
													className: WorkflowsDashboard_module_css_default.memberGroup,
													"aria-label": groupLabel,
													children: [(0, react_jsx_runtime.jsx)("h3", { children: groupLabel }), group.members.map((member) => (0, react_jsx_runtime.jsxs)("button", {
														type: "button",
														"data-workflow-member-id": member.memberId,
														"aria-pressed": selectedMemberId === member.memberId,
														onClick: () => selectMember(member.memberId),
														children: [
															(0, react_jsx_runtime.jsx)("span", { children: member.label === "" ? "Unnamed member" : member.label }),
															(0, react_jsx_runtime.jsx)("span", { children: labels.memberStatus[member.status] }),
															(0, react_jsx_runtime.jsx)("span", { children: labels.outcome[member.outcome] })
														]
													}, member.memberId))]
												}, group.key);
											}),
											members.value !== void 0 && memberRows.length === 0 && (0, react_jsx_runtime.jsx)("p", { children: "No members started." }),
											members.value !== void 0 && (0, react_jsx_runtime.jsxs)("p", {
												className: WorkflowsDashboard_module_css_default.retention,
												children: [
													"Loaded ",
													memberRows.length,
													" of ",
													members.value.total,
													" members."
												]
											}),
											members.value?.nextCursor !== void 0 && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: members.paging,
												onClick: () => loadMembers(selectedRun.runId, members.value?.nextCursor),
												children: members.paging ? "Loading…" : "Load more members"
											}),
											renderPageError(members, () => members.value?.nextCursor !== void 0 && loadMembers(selectedRun.runId, members.value.nextCursor))
										]
									})
								] })]
							}),
							(0, react_jsx_runtime.jsx)("aside", {
								className: WorkflowsDashboard_module_css_default.inspector,
								"aria-live": "polite",
								"data-pane": "inspector",
								children: inspectorPane()
							})
						]
					})
				]
			});
		}
		function RunRow({ run, selected, onSelect, labels, now }) {
			const settlement = run.status === "interrupted" && (run.terminal?.error === void 0 || run.terminal.error === "Process exited before workflow settlement.") ? labels.interruptedSettlement : void 0;
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: WorkflowsDashboard_module_css_default.runRow,
				"data-selected": selected ? "true" : "false",
				"data-workflow-run-id": run.runId,
				"aria-pressed": selected,
				onClick: onSelect,
				children: [
					(0, react_jsx_runtime.jsxs)("span", {
						className: WorkflowsDashboard_module_css_default.runTitle,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: run.displayName }), (0, react_jsx_runtime.jsx)("span", { children: statusLabel(run.status, labels) })]
					}),
					(0, react_jsx_runtime.jsx)("span", { children: run.description }),
					(0, react_jsx_runtime.jsxs)("span", { children: [
						"Phase: ",
						(0, react_jsx_runtime.jsx)("code", { children: run.phase ?? labels.noPhaseYet }),
						run.phase === "" && " (empty string)"
					] }),
					(0, react_jsx_runtime.jsxs)("span", { children: [
						budgetSummary(run),
						" · ",
						memberSummary(run, labels)
					] }),
					(0, react_jsx_runtime.jsx)("span", { children: formatDuration((run.settledAt ?? now) - run.startedAt) }),
					(0, react_jsx_runtime.jsx)("span", { children: terminalResult(run) }),
					run.terminal?.error !== void 0 && run.terminal.error !== "Process exited before workflow settlement." && (0, react_jsx_runtime.jsxs)("span", { children: ["Error: ", run.terminal.error] }),
					settlement !== void 0 && (0, react_jsx_runtime.jsx)("span", { children: settlement }),
					(0, react_jsx_runtime.jsxs)("span", { children: ["Stop reason: ", run.terminal?.stopReason ?? "—"] })
				]
			});
		}
		//#endregion
		//#region lib/client-types/slot-components.js
		/** Translate the official slot standard kit into the package-owned dialog. */
		function WorkflowsDashboardSlot(props) {
			const sessionId = props.useSessions((value) => value.current);
			const state = props.useStore((value) => value);
			const source = props.useWorkflowRuns((value) => value);
			return (0, react_jsx_runtime.jsx)(WorkflowsDashboard, {
				operations: props.operations,
				source,
				sessionId,
				open: state.open,
				store: state,
				storeActions: props.actions,
				invoker: props.invoker,
				onClose: props.onClose ?? props.actions.close,
				labels: props.labels
			});
		}
		/** Keyed durable-Chat renderer with exact-parent child navigation. */
		function WorkflowRunChatSlot(props) {
			if (props.useSessions !== void 0) props.useSessions((value) => value);
			return (0, react_jsx_runtime.jsx)(WorkflowRunPanel, {
				node: props.node,
				sessionId: props.sessionId,
				labels: props.labels,
				isChildAvailable: (childId) => props.childAvailable?.(props.sessionId, childId) === true,
				resolveAndOpenChild: (childId) => props.operations.resolveAndOpenChild(props.sessionId, childId)
			});
		}
		//#endregion
		//#region lib/client-types/index.js
		/** Services consumed by the browser half of the package. */
		const inject = [
			"connection",
			"remote",
			"sessions",
			"slots",
			"conversationEvents",
			"commandUi",
			"locale"
		];
		function disposeValue(value) {
			if (typeof value === "function") return value();
			if (typeof value?.dispose === "function") return value.dispose();
		}
		function asDisposer(value) {
			if (typeof value === "function") return value;
			if (typeof value?.dispose === "function") return () => value.dispose();
		}
		/** Top-level Session ids only. Never union `byId` (addressed children). */
		function sessionListIds(sessions) {
			const list = sessions?.list?.getSnapshot?.();
			if (list == null || typeof list !== "object") return void 0;
			if (list.phase === "pending" || list.status === "pending") return void 0;
			if (!Array.isArray(list.ids)) return void 0;
			const ids = list.ids.filter((value) => typeof value === "string");
			if (list.phase !== "ready" && ids.length === 0) return void 0;
			return ids;
		}
		function directChildAvailable(sessions, parentSessionId, childSessionId) {
			const catalog = sessions?.list?.getSnapshot?.()?.subagentsByParent?.[parentSessionId];
			if (catalog?.state !== "ready" || !Array.isArray(catalog.entries)) return false;
			return catalog.entries.some((entry) => entry?.kind === "child" && entry?.mode === "one-shot" && (entry.id ?? entry.childSessionId) === childSessionId && (entry.parentSessionId ?? entry.parentId ?? parentSessionId) === parentSessionId);
		}
		const MAX_PICKER_DEFINITIONS = 4096;
		function commandUiSupportsAction(commandUi) {
			const spec = commandUi.ActionCommandUiSpec;
			if (spec === true) return true;
			if (typeof spec === "object" && spec !== null && spec.kind === "action") return true;
			const kinds = commandUi.uiKinds;
			return Array.isArray(kinds) && kinds.includes("action");
		}
		function requireCommandUi(commandUi) {
			if (typeof commandUi !== "object" || commandUi === null) throw new Error("workflow dashboard action registration is unavailable");
			const register = commandUi.register;
			const decorate = commandUi.decorate;
			if (typeof register !== "function" || typeof decorate !== "function" || !commandUiSupportsAction(commandUi)) throw new Error("workflow dashboard action registration is unavailable");
			return commandUi;
		}
		/** Load the complete picker catalog through the generated direct Agent face. */
		async function loadPickerDefinitions(remote, session, signal) {
			const definitions = remote?.workflowDefinitions;
			if (typeof definitions?.list !== "function") throw new Error("workflow definition picker is unavailable");
			const items = [];
			const seen = /* @__PURE__ */ new Set();
			let cursor;
			for (;;) {
				const request = cursor === void 0 ? { limit: 200 } : {
					limit: 200,
					cursor
				};
				const page = unwrapWorkflowRemoteResult(await definitions.list(session.sessionId, request, signal));
				const pageItems = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : [];
				items.push(...pageItems);
				if (items.length > MAX_PICKER_DEFINITIONS) throw new Error("workflow definition picker exceeds 4096 definitions");
				const next = page?.nextCursor === void 0 ? void 0 : String(page.nextCursor);
				if (next === void 0) return items;
				if (seen.has(next) || next === cursor) throw new Error("workflow definition picker received a repeated cursor");
				seen.add(next);
				cursor = next;
			}
		}
		/**
		* Register one complete browser aggregate.  The generated Remote is mounted
		* first; every consumer and listener is created in that mount's effect and
		* is disposed before the contribution is unmounted.
		*/
		function apply(ctx) {
			const root = ctx;
			root.effect(async () => {
				const remote = root.remote;
				if (typeof remote?.$mount !== "function") throw new Error("workflow Remote mount is unavailable");
				const remoteDisposer = await remote.$mount(typert_remote_client_default);
				const sessions = root.sessions;
				const controller = new WorkflowRunsController(remote, sessions);
				const adapter = new DashboardWorkflowRunsAdapter(controller);
				const cleanup = [];
				let dashboardActions;
				let overlayState = { invoker: null };
				const overlayListeners = /* @__PURE__ */ new Set();
				const publishOverlay = (next) => {
					overlayState = next;
					for (const listener of [...overlayListeners]) listener();
				};
				const captureInvoker = (element) => {
					const active = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
					publishOverlay({ invoker: element ?? active });
				};
				root.workflowRunsController = controller;
				root.workflowRunsAdapter = adapter;
				root.workflowRunDefinition = workflowRunDefinition;
				const addCleanup = (value) => {
					if (value !== void 0) cleanup.push(value);
				};
				addCleanup(root.locale?.register?.(NS, workflowLocales));
				addCleanup(root.conversationEvents?.register?.(workflowMessageDefinition$1));
				if (root.conversationEvents !== void 0 && root.conversationEvents.register !== void 0 && workflowMessageDefinition$1 !== workflowRunDefinition) addCleanup(root.conversationEvents.register(workflowRunDefinition));
				const runChatComponent = (props) => {
					const dict = workflowLocaleFromBind(typeof root.locale?.bind === "function" ? root.locale.bind(NS) : void 0);
					return (0, react.createElement)(WorkflowRunChatSlot, {
						...props,
						operations: adapter,
						useSessions: props.useSessions,
						labels: workflowChatLabelsFromLocale(dict),
						childAvailable: (parent, child) => directChildAvailable(sessions, parent, child)
					});
				};
				const chatInjection = root.slots?.inject?.("conversation.chat.node", () => root.slots.register({
					name: "conversation.chat.node",
					key: "workflow-run",
					locale: NS,
					inject: () => ({
						operations: adapter,
						childAvailable: (parent, child) => directChildAvailable(sessions, parent, child)
					})
				}, runChatComponent));
				addCleanup(chatInjection);
				/** Root-scoped overlay component; slot standard hooks remain framework-owned. */
				function DashboardContribution(props) {
					if (props.actions !== void 0) dashboardActions = props.actions;
					const list = sessions.list;
					const sessionId = (0, react.useSyncExternalStore)(list.subscribe.bind(list), () => list.getSnapshot().current, () => list.getSnapshot().current);
					const overlay = (0, react.useSyncExternalStore)((listener) => {
						overlayListeners.add(listener);
						return () => {
							overlayListeners.delete(listener);
						};
					}, () => overlayState, () => overlayState);
					const source = (0, react.useSyncExternalStore)(adapter.source.subscribe, adapter.source.getSnapshot, adapter.source.getSnapshot);
					const dict = workflowLocaleFromBind(typeof root.locale?.bind === "function" ? root.locale.bind(NS) : void 0);
					const close = () => {
						publishOverlay({ invoker: overlay.invoker });
						props.actions?.close?.();
					};
					return (0, react.createElement)(WorkflowsDashboardSlot, {
						...props,
						useSessions: props.useSessions ?? ((selector) => selector({ current: sessionId })),
						useStore: props.useStore ?? ((selector) => selector({
							open: false,
							selectedRunId: void 0,
							selectedMemberId: void 0,
							selectedArtifactName: void 0,
							inspectorTab: "members",
							mobileView: "runs"
						})),
						useWorkflowRuns: props.useWorkflowRuns ?? ((selector) => selector(source)),
						actions: props.actions ?? {
							open: () => void 0,
							close: () => void 0,
							selectRun: () => void 0,
							reconcileRun: () => void 0,
							selectMember: () => void 0,
							selectArtifact: () => void 0,
							selectTab: () => void 0,
							showRuns: () => void 0,
							showExecution: () => void 0,
							showRun: () => void 0
						},
						operations: adapter,
						invoker: overlay.invoker,
						onClose: close,
						labels: dashboardLabelsFromLocale(dict)
					});
				}
				const overlayInjection = root.slots?.inject?.("shell.overlay", () => root.slots.register({
					name: "shell.overlay",
					id: "workflows-dashboard",
					order: 100,
					locale: NS,
					store: createWorkflowsStore,
					inject: (actions) => {
						if (actions !== void 0 && typeof actions.open === "function") dashboardActions = actions;
						return {
							operations: adapter,
							hooks: { workflowRuns: adapter.source }
						};
					}
				}, DashboardContribution));
				addCleanup(overlayInjection);
				const overlayMounted = overlayInjection !== void 0;
				const commandUi = requireCommandUi(root.commandUi);
				const translate = typeof root.locale?.bind === "function" ? root.locale.bind(NS) : void 0;
				const workflowsDescription = typeof translate === "function" ? String(translate("commandDescription")) : workflowLocales.en.commandDescription;
				addCleanup(asDisposer(commandUi.register({
					name: "workflows",
					description: workflowsDescription,
					available: () => true,
					ui: {
						kind: "action",
						run: () => {
							if (!overlayMounted || dashboardActions === void 0 || typeof dashboardActions.open !== "function") throw new Error("workflow dashboard overlay is not mounted");
							captureInvoker(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
							dashboardActions.open();
						}
					}
				})));
				addCleanup(asDisposer(commandUi.decorate({
					name: "workflow",
					available: () => true,
					ui: {
						kind: "popupSelect",
						options: async (session, signal) => {
							return (await loadPickerDefinitions(remote, session, signal)).map((definition) => ({
								id: String(definition.name),
								label: String(definition.name),
								detail: `${String(definition.description ?? "")}${definition.whenToUse === void 0 ? "" : ` — ${String(definition.whenToUse)}`} · ${String(definition.scope ?? "")}`
							}));
						},
						onSelect: async (option, session) => {
							const live = (sessions.binding?.(session.sessionId))?.session;
							if (live === void 0) throw new Error("this session is not available");
							const result = await live.command(`/workflow ${String(option.id)}`);
							if (result?.ok === false) throw new Error(typeof result.error === "string" && result.error.length > 0 ? result.error : "the host rejected /workflow");
							if (result?.value?.matched === false) throw new Error("the host offers no /workflow command");
						}
					}
				})));
				const remoteOn = remote.$on;
				if (typeof remoteOn !== "function") throw new Error("workflow Remote event subscription is unavailable");
				addCleanup(remoteOn.call(remote, "workflows/run-change", (change) => controller.handleChange(change)));
				const hostDescription = root.connection?.hostDescription;
				if (hostDescription?.subscribe !== void 0) {
					addCleanup(hostDescription.subscribe(() => {
						if (hostDescription.getSnapshot?.() === void 0) controller.handleDisconnected();
						else controller.handleConnected();
					}));
					if (hostDescription.getSnapshot?.() === void 0) controller.handleDisconnected();
				}
				if (typeof root.on === "function") {
					const registered = root.on("connection/reset", () => controller.handleReset());
					if (typeof registered === "function") addCleanup(registered);
				}
				if (sessions.list?.subscribe !== void 0) {
					let previous = new Set(sessionListIds(sessions) ?? []);
					addCleanup(sessions.list.subscribe(() => {
						const current = sessionListIds(sessions);
						if (current === void 0) return;
						const keys = new Set(current);
						for (const id of previous) if (!keys.has(id)) controller.removeSession(id);
						previous = keys;
					}));
				}
				return async () => {
					dashboardActions = void 0;
					overlayListeners.clear();
					for (const dispose of cleanup.reverse()) try {
						await dispose();
					} catch {}
					adapter.dispose();
					controller.dispose();
					await disposeValue(remoteDisposer);
				};
			}, "dsh-workflows: client aggregate");
		}
		//#endregion
		exports.DashboardWorkflowRunsAdapter = DashboardWorkflowRunsAdapter;
		exports.GENERIC_CONTROL_ERROR = GENERIC_CONTROL_ERROR;
		exports.GENERIC_LOAD_ERROR = GENERIC_LOAD_ERROR;
		exports.INTERRUPTED_SETTLEMENT = INTERRUPTED_SETTLEMENT;
		exports.MarkdownText = MarkdownText;
		exports.NS = NS;
		exports.STALE_CONTROL_ERROR = STALE_CONTROL_ERROR;
		exports.WorkflowMemberInspector = WorkflowMemberInspector;
		exports.WorkflowRunPanel = WorkflowRunPanel;
		exports.WorkflowRunsController = WorkflowRunsController;
		exports.WorkflowRunsRemoteError = WorkflowRunsRemoteError;
		exports.WorkflowsDashboard = WorkflowsDashboard;
		exports.advanceWorkflowDisclosure = advanceWorkflowDisclosure;
		exports.appendArtifactChunk = appendArtifactChunk;
		exports.apply = apply;
		exports.createWorkflowStore = createWorkflowStore;
		exports.createWorkflowsStore = createWorkflowsStore;
		exports.dashboardLabelsFromLocale = dashboardLabelsFromLocale;
		exports.initialWorkflowDisclosure = initialWorkflowDisclosure;
		exports.inject = inject;
		exports.orderWorkflowRuns = orderWorkflowRuns;
		exports.unwrapWorkflowRemoteResult = unwrapWorkflowRemoteResult;
		exports.workflowChatLabelsFromLocale = workflowChatLabelsFromLocale;
		exports.workflowLocaleFromBind = workflowLocaleFromBind;
		exports.workflowLocales = workflowLocales;
		exports.workflowMessageDefinition = workflowMessageDefinition;
		exports.workflowPhaseKey = workflowPhaseKey;
		exports.workflowRunDefinition = workflowRunDefinition;
		exports.workflowsActions = workflowsActions;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map