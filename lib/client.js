window.__ModuleLoader__.load({
	id: "@zaalipro/dsh-workflows",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
		var _a$1;
		function $constructor(name, initializer, params) {
			function init(inst, def) {
				if (!inst._zod) Object.defineProperty(inst, "_zod", {
					value: {
						def,
						constr: _,
						traits: /* @__PURE__ */ new Set()
					},
					enumerable: false
				});
				if (inst._zod.traits.has(name)) return;
				inst._zod.traits.add(name);
				initializer(inst, def);
				const proto = _.prototype;
				const keys = Object.keys(proto);
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i];
					if (!(k in inst)) inst[k] = proto[k].bind(inst);
				}
			}
			const Parent = params?.Parent ?? Object;
			class Definition extends Parent {}
			Object.defineProperty(Definition, "name", { value: name });
			function _(def) {
				var _a;
				const inst = params?.Parent ? new Definition() : this;
				init(inst, def);
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				for (const fn of inst._zod.deferred) fn();
				return inst;
			}
			Object.defineProperty(_, "init", { value: init });
			Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
				if (params?.Parent && inst instanceof params.Parent) return true;
				return inst?._zod?.traits?.has(name);
			} });
			Object.defineProperty(_, "name", { value: name });
			return _;
		}
		var $ZodAsyncError = class extends Error {
			constructor() {
				super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
			}
		};
		var $ZodEncodeError = class extends Error {
			constructor(name) {
				super(`Encountered unidirectional transform during encode: ${name}`);
				this.name = "ZodEncodeError";
			}
		};
		(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
		const globalConfig = globalThis.__zod_globalConfig;
		function config(newConfig) {
			if (newConfig) Object.assign(globalConfig, newConfig);
			return globalConfig;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
		function getEnumValues(entries) {
			const numericValues = Object.values(entries).filter((v) => typeof v === "number");
			return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
		}
		function jsonStringifyReplacer(_, value) {
			if (typeof value === "bigint") return value.toString();
			return value;
		}
		function cached(getter) {
			return { get value() {
				{
					const value = getter();
					Object.defineProperty(this, "value", { value });
					return value;
				}
			} };
		}
		function nullish(input) {
			return input === null || input === void 0;
		}
		function cleanRegex(source) {
			const start = source.startsWith("^") ? 1 : 0;
			const end = source.endsWith("$") ? source.length - 1 : source.length;
			return source.slice(start, end);
		}
		function floatSafeRemainder(val, step) {
			const ratio = val / step;
			const roundedRatio = Math.round(ratio);
			const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
			if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
			return ratio - roundedRatio;
		}
		const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
		function defineLazy(object, key, getter) {
			let value = void 0;
			Object.defineProperty(object, key, {
				get() {
					if (value === EVALUATING) return;
					if (value === void 0) {
						value = EVALUATING;
						value = getter();
					}
					return value;
				},
				set(v) {
					Object.defineProperty(object, key, { value: v });
				},
				configurable: true
			});
		}
		function assignProp(target, prop, value) {
			Object.defineProperty(target, prop, {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		function mergeDefs(...defs) {
			const mergedDescriptors = {};
			for (const def of defs) {
				const descriptors = Object.getOwnPropertyDescriptors(def);
				Object.assign(mergedDescriptors, descriptors);
			}
			return Object.defineProperties({}, mergedDescriptors);
		}
		function esc(str) {
			return JSON.stringify(str);
		}
		function slugify(input) {
			return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
		}
		const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
		function isObject(data) {
			return typeof data === "object" && data !== null && !Array.isArray(data);
		}
		const allowsEval = /* @__PURE__*/ cached(() => {
			if (globalConfig.jitless) return false;
			if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
			try {
				new Function("");
				return true;
			} catch (_) {
				return false;
			}
		});
		function isPlainObject(o) {
			if (isObject(o) === false) return false;
			const ctor = o.constructor;
			if (ctor === void 0) return true;
			if (typeof ctor !== "function") return true;
			const prot = ctor.prototype;
			if (isObject(prot) === false) return false;
			if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
			return true;
		}
		function shallowClone(o) {
			if (isPlainObject(o)) return { ...o };
			if (Array.isArray(o)) return [...o];
			if (o instanceof Map) return new Map(o);
			if (o instanceof Set) return new Set(o);
			return o;
		}
		const propertyKeyTypes = /* @__PURE__*/ new Set([
			"string",
			"number",
			"symbol"
		]);
		function escapeRegex(str) {
			return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function clone(inst, def, params) {
			const cl = new inst._zod.constr(def ?? inst._zod.def);
			if (!def || params?.parent) cl._zod.parent = inst;
			return cl;
		}
		function normalizeParams(_params) {
			const params = _params;
			if (!params) return {};
			if (typeof params === "string") return { error: () => params };
			if (params?.message !== void 0) {
				if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
				params.error = params.message;
			}
			delete params.message;
			if (typeof params.error === "string") return {
				...params,
				error: () => params.error
			};
			return params;
		}
		function optionalKeys(shape) {
			return Object.keys(shape).filter((k) => {
				return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
			});
		}
		const NUMBER_FORMAT_RANGES = {
			safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			int32: [-2147483648, 2147483647],
			uint32: [0, 4294967295],
			float32: [-34028234663852886e22, 34028234663852886e22],
			float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
		};
		function pick(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = {};
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						newShape[key] = currDef.shape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function omit(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = { ...schema._zod.def.shape };
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						delete newShape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function extend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) {
				const existingShape = schema._zod.def.shape;
				for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
			}
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function safeExtend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function merge(a, b) {
			if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
			return clone(a, mergeDefs(a._zod.def, {
				get shape() {
					const _shape = {
						...a._zod.def.shape,
						...b._zod.def.shape
					};
					assignProp(this, "shape", _shape);
					return _shape;
				},
				get catchall() {
					return b._zod.def.catchall;
				},
				checks: b._zod.def.checks ?? []
			}));
		}
		function partial(Class, schema, mask) {
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const oldShape = schema._zod.def.shape;
					const shape = { ...oldShape };
					if (mask) for (const key in mask) {
						if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						shape[key] = Class ? new Class({
							type: "optional",
							innerType: oldShape[key]
						}) : oldShape[key];
					}
					else for (const key in oldShape) shape[key] = Class ? new Class({
						type: "optional",
						innerType: oldShape[key]
					}) : oldShape[key];
					assignProp(this, "shape", shape);
					return shape;
				},
				checks: []
			}));
		}
		function required(Class, schema, mask) {
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const oldShape = schema._zod.def.shape;
				const shape = { ...oldShape };
				if (mask) for (const key in mask) {
					if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
					if (!mask[key]) continue;
					shape[key] = new Class({
						type: "nonoptional",
						innerType: oldShape[key]
					});
				}
				else for (const key in oldShape) shape[key] = new Class({
					type: "nonoptional",
					innerType: oldShape[key]
				});
				assignProp(this, "shape", shape);
				return shape;
			} }));
		}
		function aborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
			return false;
		}
		function explicitlyAborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
			return false;
		}
		function prefixIssues(path, issues) {
			return issues.map((iss) => {
				var _a;
				(_a = iss).path ?? (_a.path = []);
				iss.path.unshift(path);
				return iss;
			});
		}
		function unwrapMessage(message) {
			return typeof message === "string" ? message : message?.message;
		}
		function finalizeIssue(iss, ctx, config) {
			const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
			const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
			rest.path ?? (rest.path = []);
			rest.message = message;
			if (ctx?.reportInput) rest.input = _input;
			return rest;
		}
		function getLengthableOrigin(input) {
			if (Array.isArray(input)) return "array";
			if (typeof input === "string") return "string";
			return "unknown";
		}
		function issue(...args) {
			const [iss, input, inst] = args;
			if (typeof iss === "string") return {
				message: iss,
				code: "custom",
				input,
				inst
			};
			return { ...iss };
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
		const initializer$1 = (inst, def) => {
			inst.name = "$ZodError";
			Object.defineProperty(inst, "_zod", {
				value: inst._zod,
				enumerable: false
			});
			Object.defineProperty(inst, "issues", {
				value: def,
				enumerable: false
			});
			inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
			Object.defineProperty(inst, "toString", {
				value: () => inst.message,
				enumerable: false
			});
		};
		const $ZodError = $constructor("$ZodError", initializer$1);
		const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
		function flattenError(error, mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of error.issues) if (sub.path.length > 0) {
				fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
				fieldErrors[sub.path[0]].push(mapper(sub));
			} else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		function formatError(error, mapper = (issue) => issue.message) {
			const fieldErrors = { _errors: [] };
			const processError = (error, path = []) => {
				for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
				else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else {
					const fullpath = [...path, ...issue.path];
					if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
					else {
						let curr = fieldErrors;
						let i = 0;
						while (i < fullpath.length) {
							const el = fullpath[i];
							if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
							else {
								curr[el] = curr[el] || { _errors: [] };
								curr[el]._errors.push(mapper(issue));
							}
							curr = curr[el];
							i++;
						}
					}
				}
			};
			processError(error);
			return fieldErrors;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
		const _parse = (_Err) => (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			if (result.issues.length) {
				const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, _params?.callee);
				throw e;
			}
			return result.value;
		};
		const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			if (result.issues.length) {
				const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, params?.callee);
				throw e;
			}
			return result.value;
		};
		const _safeParse = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length ? {
				success: false,
				error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
		const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length ? {
				success: false,
				error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
		const _encode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parse(_Err)(schema, value, ctx);
		};
		const _decode = (_Err) => (schema, value, _ctx) => {
			return _parse(_Err)(schema, value, _ctx);
		};
		const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parseAsync(_Err)(schema, value, ctx);
		};
		const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _parseAsync(_Err)(schema, value, _ctx);
		};
		const _safeEncode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParse(_Err)(schema, value, ctx);
		};
		const _safeDecode = (_Err) => (schema, value, _ctx) => {
			return _safeParse(_Err)(schema, value, _ctx);
		};
		const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParseAsync(_Err)(schema, value, ctx);
		};
		const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _safeParseAsync(_Err)(schema, value, _ctx);
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const cuid = /^[cC][0-9a-z]{6,}$/;
		const cuid2 = /^[0-9a-z]+$/;
		const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
		const xid = /^[0-9a-vA-V]{20}$/;
		const ksuid = /^[A-Za-z0-9]{27}$/;
		const nanoid = /^[a-zA-Z0-9_-]{21}$/;
		/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
		const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
		/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
		const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
		/** Returns a regex for validating an RFC 9562/4122 UUID.
		*
		* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
		const uuid = (version) => {
			if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
			return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
		};
		/** Practical email validation */
		const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
		const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
		function emoji() {
			return new RegExp(_emoji$1, "u");
		}
		const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
		const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
		const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
		const base64url = /^[A-Za-z0-9_-]*$/;
		const httpProtocol = /^https?$/;
		const e164 = /^\+[1-9]\d{6,14}$/;
		const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
		const date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
		function timeSource(args) {
			const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
			return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
		}
		function time$1(args) {
			return new RegExp(`^${timeSource(args)}$`);
		}
		function datetime$1(args) {
			const time = timeSource({ precision: args.precision });
			const opts = ["Z"];
			if (args.local) opts.push("");
			if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
			const timeRegex = `${time}(?:${opts.join("|")})`;
			return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
		}
		const string$1 = (params) => {
			const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
			return new RegExp(`^${regex}$`);
		};
		const integer = /^-?\d+$/;
		const number$1 = /^-?\d+(?:\.\d+)?$/;
		const boolean$1 = /^(?:true|false)$/i;
		const _undefined$2 = /^undefined$/i;
		const lowercase = /^[^A-Z]*$/;
		const uppercase = /^[^a-z]*$/;
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
		const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
			var _a;
			inst._zod ?? (inst._zod = {});
			inst._zod.def = def;
			(_a = inst._zod).onattach ?? (_a.onattach = []);
		});
		const numericOriginMap = {
			number: "number",
			bigint: "bigint",
			object: "date"
		};
		const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
				if (def.value < curr) {
					if (def.inclusive) bag.maximum = def.value;
					else bag.exclusiveMaximum = def.value;
				}
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
				if (def.value > curr) {
					if (def.inclusive) bag.minimum = def.value;
					else bag.exclusiveMinimum = def.value;
				}
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				var _a;
				(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
			});
			inst._zod.check = (payload) => {
				if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
				if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
				payload.issues.push({
					origin: typeof payload.value,
					code: "not_multiple_of",
					divisor: def.value,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
			$ZodCheck.init(inst, def);
			def.format = def.format || "float64";
			const isInt = def.format?.includes("int");
			const origin = isInt ? "int" : "number";
			const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				bag.minimum = minimum;
				bag.maximum = maximum;
				if (isInt) bag.pattern = integer;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (isInt) {
					if (!Number.isInteger(input)) {
						payload.issues.push({
							expected: origin,
							format: def.format,
							code: "invalid_type",
							continue: false,
							input,
							inst
						});
						return;
					}
					if (!Number.isSafeInteger(input)) {
						if (input > 0) payload.issues.push({
							input,
							code: "too_big",
							maximum: Number.MAX_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						else payload.issues.push({
							input,
							code: "too_small",
							minimum: Number.MIN_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						return;
					}
				}
				if (input < minimum) payload.issues.push({
					origin: "number",
					input,
					code: "too_small",
					minimum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
				if (input > maximum) payload.issues.push({
					origin: "number",
					input,
					code: "too_big",
					maximum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
				if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length <= def.maximum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: def.maximum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
				if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length >= def.minimum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: def.minimum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.minimum = def.length;
				bag.maximum = def.length;
				bag.length = def.length;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				const length = input.length;
				if (length === def.length) return;
				const origin = getLengthableOrigin(input);
				const tooBig = length > def.length;
				payload.issues.push({
					origin,
					...tooBig ? {
						code: "too_big",
						maximum: def.length
					} : {
						code: "too_small",
						minimum: def.length
					},
					inclusive: true,
					exact: true,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
			var _a, _b;
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				if (def.pattern) {
					bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
					bag.patterns.add(def.pattern);
				}
			});
			if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: def.format,
					input: payload.value,
					...def.pattern ? { pattern: def.pattern.toString() } : {},
					inst,
					continue: !def.abort
				});
			});
			else (_b = inst._zod).check ?? (_b.check = () => {});
		});
		const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					pattern: def.pattern.toString(),
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
			def.pattern ?? (def.pattern = lowercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
			def.pattern ?? (def.pattern = uppercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
			$ZodCheck.init(inst, def);
			const escapedRegex = escapeRegex(def.includes);
			const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
			def.pattern = pattern;
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.includes(def.includes, def.position)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "includes",
					includes: def.includes,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.startsWith(def.prefix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "starts_with",
					prefix: def.prefix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.endsWith(def.suffix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "ends_with",
					suffix: def.suffix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.check = (payload) => {
				payload.value = def.tx(payload.value);
			};
		});
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
		var Doc = class {
			constructor(args = []) {
				this.content = [];
				this.indent = 0;
				if (this) this.args = args;
			}
			indented(fn) {
				this.indent += 1;
				fn(this);
				this.indent -= 1;
			}
			write(arg) {
				if (typeof arg === "function") {
					arg(this, { execution: "sync" });
					arg(this, { execution: "async" });
					return;
				}
				const lines = arg.split("\n").filter((x) => x);
				const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
				const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
				for (const line of dedented) this.content.push(line);
			}
			compile() {
				const F = Function;
				const args = this?.args;
				const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
				return new F(...args, lines.join("\n"));
			}
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
		const version = {
			major: 4,
			minor: 4,
			patch: 3
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
		const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
			var _a;
			inst ?? (inst = {});
			inst._zod.def = def;
			inst._zod.bag = inst._zod.bag || {};
			inst._zod.version = version;
			const checks = [...inst._zod.def.checks ?? []];
			if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
			for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
			if (checks.length === 0) {
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred?.push(() => {
					inst._zod.run = inst._zod.parse;
				});
			} else {
				const runChecks = (payload, checks, ctx) => {
					let isAborted = aborted(payload);
					let asyncResult;
					for (const ch of checks) {
						if (ch._zod.def.when) {
							if (explicitlyAborted(payload)) continue;
							if (!ch._zod.def.when(payload)) continue;
						} else if (isAborted) continue;
						const currLen = payload.issues.length;
						const _ = ch._zod.check(payload);
						if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
						if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
							await _;
							if (payload.issues.length === currLen) return;
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
						else {
							if (payload.issues.length === currLen) continue;
							if (!isAborted) isAborted = aborted(payload, currLen);
						}
					}
					if (asyncResult) return asyncResult.then(() => {
						return payload;
					});
					return payload;
				};
				const handleCanaryResult = (canary, payload, ctx) => {
					if (aborted(canary)) {
						canary.aborted = true;
						return canary;
					}
					const checkResult = runChecks(payload, checks, ctx);
					if (checkResult instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
					}
					return inst._zod.parse(checkResult, ctx);
				};
				inst._zod.run = (payload, ctx) => {
					if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
					if (ctx.direction === "backward") {
						const canary = inst._zod.parse({
							value: payload.value,
							issues: []
						}, {
							...ctx,
							skipChecks: true
						});
						if (canary instanceof Promise) return canary.then((canary) => {
							return handleCanaryResult(canary, payload, ctx);
						});
						return handleCanaryResult(canary, payload, ctx);
					}
					const result = inst._zod.parse(payload, ctx);
					if (result instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return result.then((result) => runChecks(result, checks, ctx));
					}
					return runChecks(result, checks, ctx);
				};
			}
			defineLazy(inst, "~standard", () => ({
				validate: (value) => {
					try {
						const r = safeParse$1(inst, value);
						return r.success ? { value: r.data } : { issues: r.error?.issues };
					} catch (_) {
						return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
					}
				},
				vendor: "zod",
				version: 1
			}));
		});
		const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
			inst._zod.parse = (payload, _) => {
				if (def.coerce) try {
					payload.value = String(payload.value);
				} catch (_) {}
				if (typeof payload.value === "string") return payload;
				payload.issues.push({
					expected: "string",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			$ZodString.init(inst, def);
		});
		const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
			def.pattern ?? (def.pattern = guid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
			if (def.version) {
				const v = {
					v1: 1,
					v2: 2,
					v3: 3,
					v4: 4,
					v5: 5,
					v6: 6,
					v7: 7,
					v8: 8
				}[def.version];
				if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
				def.pattern ?? (def.pattern = uuid(v));
			} else def.pattern ?? (def.pattern = uuid());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
			def.pattern ?? (def.pattern = email);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				try {
					const trimmed = payload.value.trim();
					if (!def.normalize && def.protocol?.source === httpProtocol.source) {
						if (!/^https?:\/\//i.test(trimmed)) {
							payload.issues.push({
								code: "invalid_format",
								format: "url",
								note: "Invalid URL format",
								input: payload.value,
								inst,
								continue: !def.abort
							});
							return;
						}
					}
					const url = new URL(trimmed);
					if (def.hostname) {
						def.hostname.lastIndex = 0;
						if (!def.hostname.test(url.hostname)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid hostname",
							pattern: def.hostname.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.protocol) {
						def.protocol.lastIndex = 0;
						if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid protocol",
							pattern: def.protocol.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.normalize) payload.value = url.href;
					else payload.value = trimmed;
					return;
				} catch (_) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
			def.pattern ?? (def.pattern = emoji());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
			def.pattern ?? (def.pattern = nanoid);
			$ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
			def.pattern ?? (def.pattern = cuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
			def.pattern ?? (def.pattern = cuid2);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
			def.pattern ?? (def.pattern = ulid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
			def.pattern ?? (def.pattern = xid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
			def.pattern ?? (def.pattern = ksuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
			def.pattern ?? (def.pattern = datetime$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
			def.pattern ?? (def.pattern = date$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
			def.pattern ?? (def.pattern = time$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
			def.pattern ?? (def.pattern = duration$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
			def.pattern ?? (def.pattern = ipv4);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv4`;
		});
		const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
			def.pattern ?? (def.pattern = ipv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv6`;
			inst._zod.check = (payload) => {
				try {
					new URL(`http://[${payload.value}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "ipv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv4);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				const parts = payload.value.split("/");
				try {
					if (parts.length !== 2) throw new Error();
					const [address, prefix] = parts;
					if (!prefix) throw new Error();
					const prefixNum = Number(prefix);
					if (`${prefixNum}` !== prefix) throw new Error();
					if (prefixNum < 0 || prefixNum > 128) throw new Error();
					new URL(`http://[${address}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "cidrv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		function isValidBase64(data) {
			if (data === "") return true;
			if (/\s/.test(data)) return false;
			if (data.length % 4 !== 0) return false;
			try {
				atob(data);
				return true;
			} catch {
				return false;
			}
		}
		const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
			def.pattern ?? (def.pattern = base64);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64";
			inst._zod.check = (payload) => {
				if (isValidBase64(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		function isValidBase64URL(data) {
			if (!base64url.test(data)) return false;
			const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
			return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
		}
		const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
			def.pattern ?? (def.pattern = base64url);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64url";
			inst._zod.check = (payload) => {
				if (isValidBase64URL(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
			def.pattern ?? (def.pattern = e164);
			$ZodStringFormat.init(inst, def);
		});
		function isValidJWT(token, algorithm = null) {
			try {
				const tokensParts = token.split(".");
				if (tokensParts.length !== 3) return false;
				const [header] = tokensParts;
				if (!header) return false;
				const parsedHeader = JSON.parse(atob(header));
				if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
				if (!parsedHeader.alg) return false;
				if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
				return true;
			} catch {
				return false;
			}
		}
		const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidJWT(payload.value, def.alg)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "jwt",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Number(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
				const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
				payload.issues.push({
					expected: "number",
					code: "invalid_type",
					input,
					inst,
					...received ? { received } : {}
				});
				return payload;
			};
		});
		const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
			$ZodCheckNumberFormat.init(inst, def);
			$ZodNumber.init(inst, def);
		});
		const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = boolean$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Boolean(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "boolean") return payload;
				payload.issues.push({
					expected: "boolean",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUndefined = /*@__PURE__*/ $constructor("$ZodUndefined", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = _undefined$2;
			inst._zod.values = /* @__PURE__ */ new Set([void 0]);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (typeof input === "undefined") return payload;
				payload.issues.push({
					expected: "undefined",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload) => payload;
		});
		const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _ctx) => {
				payload.issues.push({
					expected: "never",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		function handleArrayResult(result, final, index) {
			if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
			final.value[index] = result.value;
		}
		const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!Array.isArray(input)) {
					payload.issues.push({
						expected: "array",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = Array(input.length);
				const proms = [];
				for (let i = 0; i < input.length; i++) {
					const item = input[i];
					const result = def.element._zod.run({
						value: item,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
					else handleArrayResult(result, payload, i);
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
			const isPresent = key in input;
			if (result.issues.length) {
				if (isOptionalIn && isOptionalOut && !isPresent) return;
				final.issues.push(...prefixIssues(key, result.issues));
			}
			if (!isPresent && !isOptionalIn) {
				if (!result.issues.length) final.issues.push({
					code: "invalid_type",
					expected: "nonoptional",
					input: void 0,
					path: [key]
				});
				return;
			}
			if (result.value === void 0) {
				if (isPresent) final.value[key] = void 0;
			} else final.value[key] = result.value;
		}
		function normalizeDef(def) {
			const keys = Object.keys(def.shape);
			for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
			const okeys = optionalKeys(def.shape);
			return {
				...def,
				keys,
				keySet: new Set(keys),
				numKeys: keys.length,
				optionalKeys: new Set(okeys)
			};
		}
		function handleCatchall(proms, input, payload, ctx, def, inst) {
			const unrecognized = [];
			const keySet = def.keySet;
			const _catchall = def.catchall._zod;
			const t = _catchall.def.type;
			const isOptionalIn = _catchall.optin === "optional";
			const isOptionalOut = _catchall.optout === "optional";
			for (const key in input) {
				if (key === "__proto__") continue;
				if (keySet.has(key)) continue;
				if (t === "never") {
					unrecognized.push(key);
					continue;
				}
				const r = _catchall.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
				else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
			}
			if (unrecognized.length) payload.issues.push({
				code: "unrecognized_keys",
				keys: unrecognized,
				input,
				inst
			});
			if (!proms.length) return payload;
			return Promise.all(proms).then(() => {
				return payload;
			});
		}
		const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
			$ZodType.init(inst, def);
			if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
				const sh = def.shape;
				Object.defineProperty(def, "shape", { get: () => {
					const newSh = { ...sh };
					Object.defineProperty(def, "shape", { value: newSh });
					return newSh;
				} });
			}
			const _normalized = cached(() => normalizeDef(def));
			defineLazy(inst._zod, "propValues", () => {
				const shape = def.shape;
				const propValues = {};
				for (const key in shape) {
					const field = shape[key]._zod;
					if (field.values) {
						propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
						for (const v of field.values) propValues[key].add(v);
					}
				}
				return propValues;
			});
			const isObject$1 = isObject;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$1(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = {};
				const proms = [];
				const shape = value.shape;
				for (const key of value.keys) {
					const el = shape[key];
					const isOptionalIn = el._zod.optin === "optional";
					const isOptionalOut = el._zod.optout === "optional";
					const r = el._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
					else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
				}
				if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
				return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
			};
		});
		const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
			$ZodObject.init(inst, def);
			const superParse = inst._zod.parse;
			const _normalized = cached(() => normalizeDef(def));
			const generateFastpass = (shape) => {
				const doc = new Doc([
					"shape",
					"payload",
					"ctx"
				]);
				const normalized = _normalized.value;
				const parseStr = (key) => {
					const k = esc(key);
					return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
				};
				doc.write(`const input = payload.value;`);
				const ids = Object.create(null);
				let counter = 0;
				for (const key of normalized.keys) ids[key] = `key_${counter++}`;
				doc.write(`const newResult = {};`);
				for (const key of normalized.keys) {
					const id = ids[key];
					const k = esc(key);
					const schema = shape[key];
					const isOptionalIn = schema?._zod?.optin === "optional";
					const isOptionalOut = schema?._zod?.optout === "optional";
					doc.write(`const ${id} = ${parseStr(key)};`);
					if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
					else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
					else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
				}
				doc.write(`payload.value = newResult;`);
				doc.write(`return payload;`);
				const fn = doc.compile();
				return (payload, ctx) => fn(shape, payload, ctx);
			};
			let fastpass;
			const isObject$2 = isObject;
			const jit = !globalConfig.jitless;
			const fastEnabled = jit && allowsEval.value;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$2(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
					if (!fastpass) fastpass = generateFastpass(def.shape);
					payload = fastpass(payload, ctx);
					if (!catchall) return payload;
					return handleCatchall([], input, payload, ctx, value, inst);
				}
				return superParse(payload, ctx);
			};
		});
		function handleUnionResults(results, final, inst, ctx) {
			for (const result of results) if (result.issues.length === 0) {
				final.value = result.value;
				return final;
			}
			const nonaborted = results.filter((r) => !aborted(r));
			if (nonaborted.length === 1) {
				final.value = nonaborted[0].value;
				return nonaborted[0];
			}
			final.issues.push({
				code: "invalid_union",
				input: final.value,
				inst,
				errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			});
			return final;
		}
		const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "values", () => {
				if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
			});
			defineLazy(inst._zod, "pattern", () => {
				if (def.options.every((o) => o._zod.pattern)) {
					const patterns = def.options.map((o) => o._zod.pattern);
					return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
				}
			});
			const first = def.options.length === 1 ? def.options[0]._zod.run : null;
			inst._zod.parse = (payload, ctx) => {
				if (first) return first(payload, ctx);
				let async = false;
				const results = [];
				for (const option of def.options) {
					const result = option._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) {
						results.push(result);
						async = true;
					} else {
						if (result.issues.length === 0) return result;
						results.push(result);
					}
				}
				if (!async) return handleUnionResults(results, payload, inst, ctx);
				return Promise.all(results).then((results) => {
					return handleUnionResults(results, payload, inst, ctx);
				});
			};
		});
		const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				const left = def.left._zod.run({
					value: input,
					issues: []
				}, ctx);
				const right = def.right._zod.run({
					value: input,
					issues: []
				}, ctx);
				if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
					return handleIntersectionResults(payload, left, right);
				});
				return handleIntersectionResults(payload, left, right);
			};
		});
		function mergeValues(a, b) {
			if (a === b) return {
				valid: true,
				data: a
			};
			if (a instanceof Date && b instanceof Date && +a === +b) return {
				valid: true,
				data: a
			};
			if (isPlainObject(a) && isPlainObject(b)) {
				const bKeys = Object.keys(b);
				const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
				const newObj = {
					...a,
					...b
				};
				for (const key of sharedKeys) {
					const sharedValue = mergeValues(a[key], b[key]);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
					};
					newObj[key] = sharedValue.data;
				}
				return {
					valid: true,
					data: newObj
				};
			}
			if (Array.isArray(a) && Array.isArray(b)) {
				if (a.length !== b.length) return {
					valid: false,
					mergeErrorPath: []
				};
				const newArray = [];
				for (let index = 0; index < a.length; index++) {
					const itemA = a[index];
					const itemB = b[index];
					const sharedValue = mergeValues(itemA, itemB);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
					};
					newArray.push(sharedValue.data);
				}
				return {
					valid: true,
					data: newArray
				};
			}
			return {
				valid: false,
				mergeErrorPath: []
			};
		}
		function handleIntersectionResults(result, left, right) {
			const unrecKeys = /* @__PURE__ */ new Map();
			let unrecIssue;
			for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
				unrecIssue ?? (unrecIssue = iss);
				for (const k of iss.keys) {
					if (!unrecKeys.has(k)) unrecKeys.set(k, {});
					unrecKeys.get(k).l = true;
				}
			} else result.issues.push(iss);
			for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
				if (!unrecKeys.has(k)) unrecKeys.set(k, {});
				unrecKeys.get(k).r = true;
			}
			else result.issues.push(iss);
			const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
			if (bothKeys.length && unrecIssue) result.issues.push({
				...unrecIssue,
				keys: bothKeys
			});
			if (aborted(result)) return result;
			const merged = mergeValues(left.value, right.value);
			if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
			result.value = merged.data;
			return result;
		}
		const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!isPlainObject(input)) {
					payload.issues.push({
						expected: "record",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				const proms = [];
				const values = def.keyType._zod.values;
				if (values) {
					payload.value = {};
					const recordKeys = /* @__PURE__ */ new Set();
					for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
						recordKeys.add(typeof key === "number" ? key.toString() : key);
						const keyResult = def.keyType._zod.run({
							value: key,
							issues: []
						}, ctx);
						if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
						if (keyResult.issues.length) {
							payload.issues.push({
								code: "invalid_key",
								origin: "record",
								issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
								input: key,
								path: [key],
								inst
							});
							continue;
						}
						const outKey = keyResult.value;
						const result = def.valueType._zod.run({
							value: input[key],
							issues: []
						}, ctx);
						if (result instanceof Promise) proms.push(result.then((result) => {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[outKey] = result.value;
						}));
						else {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[outKey] = result.value;
						}
					}
					let unrecognized;
					for (const key in input) if (!recordKeys.has(key)) {
						unrecognized = unrecognized ?? [];
						unrecognized.push(key);
					}
					if (unrecognized && unrecognized.length > 0) payload.issues.push({
						code: "unrecognized_keys",
						input,
						inst,
						keys: unrecognized
					});
				} else {
					payload.value = {};
					for (const key of Reflect.ownKeys(input)) {
						if (key === "__proto__") continue;
						if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
						let keyResult = def.keyType._zod.run({
							value: key,
							issues: []
						}, ctx);
						if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
						if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
							const retryResult = def.keyType._zod.run({
								value: Number(key),
								issues: []
							}, ctx);
							if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
							if (retryResult.issues.length === 0) keyResult = retryResult;
						}
						if (keyResult.issues.length) {
							if (def.mode === "loose") payload.value[key] = input[key];
							else payload.issues.push({
								code: "invalid_key",
								origin: "record",
								issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
								input: key,
								path: [key],
								inst
							});
							continue;
						}
						const result = def.valueType._zod.run({
							value: input[key],
							issues: []
						}, ctx);
						if (result instanceof Promise) proms.push(result.then((result) => {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[keyResult.value] = result.value;
						}));
						else {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[keyResult.value] = result.value;
						}
					}
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
			$ZodType.init(inst, def);
			const values = getEnumValues(def.entries);
			const valuesSet = new Set(values);
			inst._zod.values = valuesSet;
			inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (valuesSet.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
			$ZodType.init(inst, def);
			if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
			const values = new Set(def.values);
			inst._zod.values = values;
			inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (values.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values: def.values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				const _out = def.transform(payload.value, payload);
				if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				if (_out instanceof Promise) throw new $ZodAsyncError();
				payload.value = _out;
				payload.fallback = true;
				return payload;
			};
		});
		function handleOptionalResult(result, input) {
			if (input === void 0 && (result.issues.length || result.fallback)) return {
				issues: [],
				value: void 0
			};
			return result;
		}
		const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.optout = "optional";
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
			});
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (def.innerType._zod.optin === "optional") {
					const input = payload.value;
					const result = def.innerType._zod.run(payload, ctx);
					if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
					return handleOptionalResult(result, input);
				}
				if (payload.value === void 0) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
			inst._zod.parse = (payload, ctx) => {
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
			});
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === null) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) {
					payload.value = def.defaultValue;
					/**
					* $ZodDefault returns the default value immediately in forward direction.
					* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
					return payload;
				}
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
				return handleDefaultResult(result, def);
			};
		});
		function handleDefaultResult(payload, def) {
			if (payload.value === void 0) payload.value = def.defaultValue;
			return payload;
		}
		const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) payload.value = def.defaultValue;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => {
				const v = def.innerType._zod.values;
				return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
				return handleNonOptionalResult(result, inst);
			};
		});
		function handleNonOptionalResult(payload, inst) {
			if (!payload.issues.length && payload.value === void 0) payload.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: payload.value,
				inst
			});
			return payload;
		}
		const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => {
					payload.value = result.value;
					if (result.issues.length) {
						payload.value = def.catchValue({
							...payload,
							error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
							input: payload.value
						});
						payload.issues = [];
						payload.fallback = true;
					}
					return payload;
				});
				payload.value = result.value;
				if (result.issues.length) {
					payload.value = def.catchValue({
						...payload,
						error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
						input: payload.value
					});
					payload.issues = [];
					payload.fallback = true;
				}
				return payload;
			};
		});
		const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => def.in._zod.values);
			defineLazy(inst._zod, "optin", () => def.in._zod.optin);
			defineLazy(inst._zod, "optout", () => def.out._zod.optout);
			defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") {
					const right = def.out._zod.run(payload, ctx);
					if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
					return handlePipeResult(right, def.in, ctx);
				}
				const left = def.in._zod.run(payload, ctx);
				if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
				return handlePipeResult(left, def.out, ctx);
			};
		});
		function handlePipeResult(left, next, ctx) {
			if (left.issues.length) {
				left.aborted = true;
				return left;
			}
			return next._zod.run({
				value: left.value,
				issues: left.issues,
				fallback: left.fallback
			}, ctx);
		}
		const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
			defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then(handleReadonlyResult);
				return handleReadonlyResult(result);
			};
		});
		function handleReadonlyResult(payload) {
			payload.value = Object.freeze(payload.value);
			return payload;
		}
		const $ZodLazy = /*@__PURE__*/ $constructor("$ZodLazy", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "innerType", () => {
				const d = def;
				if (!d._cachedInner) d._cachedInner = def.getter();
				return d._cachedInner;
			});
			defineLazy(inst._zod, "pattern", () => inst._zod.innerType?._zod?.pattern);
			defineLazy(inst._zod, "propValues", () => inst._zod.innerType?._zod?.propValues);
			defineLazy(inst._zod, "optin", () => inst._zod.innerType?._zod?.optin ?? void 0);
			defineLazy(inst._zod, "optout", () => inst._zod.innerType?._zod?.optout ?? void 0);
			inst._zod.parse = (payload, ctx) => {
				return inst._zod.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
			$ZodCheck.init(inst, def);
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _) => {
				return payload;
			};
			inst._zod.check = (payload) => {
				const input = payload.value;
				const r = def.fn(input);
				if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
				handleRefineResult(r, payload, input, inst);
			};
		});
		function handleRefineResult(result, payload, input, inst) {
			if (!result) {
				const _iss = {
					code: "custom",
					input,
					inst,
					path: [...inst._zod.def.path ?? []],
					continue: !inst._zod.def.abort
				};
				if (inst._zod.def.params) _iss.params = inst._zod.def.params;
				payload.issues.push(issue(_iss));
			}
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
		var _a;
		var $ZodRegistry = class {
			constructor() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
			}
			add(schema, ..._meta) {
				const meta = _meta[0];
				this._map.set(schema, meta);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
				return this;
			}
			clear() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
				return this;
			}
			remove(schema) {
				const meta = this._map.get(schema);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
				this._map.delete(schema);
				return this;
			}
			get(schema) {
				const p = schema._zod.parent;
				if (p) {
					const pm = { ...this.get(p) ?? {} };
					delete pm.id;
					const f = {
						...pm,
						...this._map.get(schema)
					};
					return Object.keys(f).length ? f : void 0;
				}
				return this._map.get(schema);
			}
			has(schema) {
				return this._map.has(schema);
			}
		};
		function registry() {
			return new $ZodRegistry();
		}
		(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
		const globalRegistry = globalThis.__zod_globalRegistry;
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
		// @__NO_SIDE_EFFECTS__
		function _string(Class, params) {
			return new Class({
				type: "string",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _email(Class, params) {
			return new Class({
				type: "string",
				format: "email",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _guid(Class, params) {
			return new Class({
				type: "string",
				format: "guid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuid(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv4(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v4",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv6(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v6",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv7(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v7",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _url(Class, params) {
			return new Class({
				type: "string",
				format: "url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _emoji(Class, params) {
			return new Class({
				type: "string",
				format: "emoji",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _nanoid(Class, params) {
			return new Class({
				type: "string",
				format: "nanoid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link _cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		// @__NO_SIDE_EFFECTS__
		function _cuid(Class, params) {
			return new Class({
				type: "string",
				format: "cuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cuid2(Class, params) {
			return new Class({
				type: "string",
				format: "cuid2",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ulid(Class, params) {
			return new Class({
				type: "string",
				format: "ulid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _xid(Class, params) {
			return new Class({
				type: "string",
				format: "xid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ksuid(Class, params) {
			return new Class({
				type: "string",
				format: "ksuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv4(Class, params) {
			return new Class({
				type: "string",
				format: "ipv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv6(Class, params) {
			return new Class({
				type: "string",
				format: "ipv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv4(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv6(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64(Class, params) {
			return new Class({
				type: "string",
				format: "base64",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64url(Class, params) {
			return new Class({
				type: "string",
				format: "base64url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _e164(Class, params) {
			return new Class({
				type: "string",
				format: "e164",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _jwt(Class, params) {
			return new Class({
				type: "string",
				format: "jwt",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDateTime(Class, params) {
			return new Class({
				type: "string",
				format: "datetime",
				check: "string_format",
				offset: false,
				local: false,
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDate(Class, params) {
			return new Class({
				type: "string",
				format: "date",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoTime(Class, params) {
			return new Class({
				type: "string",
				format: "time",
				check: "string_format",
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDuration(Class, params) {
			return new Class({
				type: "string",
				format: "duration",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _number(Class, params) {
			return new Class({
				type: "number",
				checks: [],
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _int(Class, params) {
			return new Class({
				type: "number",
				check: "number_format",
				abort: false,
				format: "safeint",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _boolean(Class, params) {
			return new Class({
				type: "boolean",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _undefined$1(Class, params) {
			return new Class({
				type: "undefined",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _unknown(Class) {
			return new Class({ type: "unknown" });
		}
		// @__NO_SIDE_EFFECTS__
		function _never(Class, params) {
			return new Class({
				type: "never",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lt(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lte(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gt(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gte(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _multipleOf(value, params) {
			return new $ZodCheckMultipleOf({
				check: "multiple_of",
				...normalizeParams(params),
				value
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _maxLength(maximum, params) {
			return new $ZodCheckMaxLength({
				check: "max_length",
				...normalizeParams(params),
				maximum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _minLength(minimum, params) {
			return new $ZodCheckMinLength({
				check: "min_length",
				...normalizeParams(params),
				minimum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _length(length, params) {
			return new $ZodCheckLengthEquals({
				check: "length_equals",
				...normalizeParams(params),
				length
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _regex(pattern, params) {
			return new $ZodCheckRegex({
				check: "string_format",
				format: "regex",
				...normalizeParams(params),
				pattern
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lowercase(params) {
			return new $ZodCheckLowerCase({
				check: "string_format",
				format: "lowercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uppercase(params) {
			return new $ZodCheckUpperCase({
				check: "string_format",
				format: "uppercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _includes(includes, params) {
			return new $ZodCheckIncludes({
				check: "string_format",
				format: "includes",
				...normalizeParams(params),
				includes
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _startsWith(prefix, params) {
			return new $ZodCheckStartsWith({
				check: "string_format",
				format: "starts_with",
				...normalizeParams(params),
				prefix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _endsWith(suffix, params) {
			return new $ZodCheckEndsWith({
				check: "string_format",
				format: "ends_with",
				...normalizeParams(params),
				suffix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _overwrite(tx) {
			return new $ZodCheckOverwrite({
				check: "overwrite",
				tx
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _normalize(form) {
			return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
		}
		// @__NO_SIDE_EFFECTS__
		function _trim() {
			return /* @__PURE__ */ _overwrite((input) => input.trim());
		}
		// @__NO_SIDE_EFFECTS__
		function _toLowerCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _toUpperCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _slugify() {
			return /* @__PURE__ */ _overwrite((input) => slugify(input));
		}
		// @__NO_SIDE_EFFECTS__
		function _array(Class, element, params) {
			return new Class({
				type: "array",
				element,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _refine(Class, fn, _params) {
			return new Class({
				type: "custom",
				check: "custom",
				fn,
				...normalizeParams(_params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _superRefine(fn, params) {
			const ch = /* @__PURE__ */ _check((payload) => {
				payload.addIssue = (issue$2) => {
					if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
					else {
						const _issue = issue$2;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = ch);
						_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
						payload.issues.push(issue(_issue));
					}
				};
				return fn(payload.value, payload);
			}, params);
			return ch;
		}
		// @__NO_SIDE_EFFECTS__
		function _check(fn, params) {
			const ch = new $ZodCheck({
				check: "custom",
				...normalizeParams(params)
			});
			ch._zod.check = fn;
			return ch;
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
		function initializeContext(params) {
			let target = params?.target ?? "draft-2020-12";
			if (target === "draft-4") target = "draft-04";
			if (target === "draft-7") target = "draft-07";
			return {
				processors: params.processors ?? {},
				metadataRegistry: params?.metadata ?? globalRegistry,
				target,
				unrepresentable: params?.unrepresentable ?? "throw",
				override: params?.override ?? (() => {}),
				io: params?.io ?? "output",
				counter: 0,
				seen: /* @__PURE__ */ new Map(),
				cycles: params?.cycles ?? "ref",
				reused: params?.reused ?? "inline",
				external: params?.external ?? void 0
			};
		}
		function process(schema, ctx, _params = {
			path: [],
			schemaPath: []
		}) {
			var _a;
			const def = schema._zod.def;
			const seen = ctx.seen.get(schema);
			if (seen) {
				seen.count++;
				if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
				return seen.schema;
			}
			const result = {
				schema: {},
				count: 1,
				cycle: void 0,
				path: _params.path
			};
			ctx.seen.set(schema, result);
			const overrideSchema = schema._zod.toJSONSchema?.();
			if (overrideSchema) result.schema = overrideSchema;
			else {
				const params = {
					..._params,
					schemaPath: [..._params.schemaPath, schema],
					path: _params.path
				};
				if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
				else {
					const _json = result.schema;
					const processor = ctx.processors[def.type];
					if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
					processor(schema, ctx, _json, params);
				}
				const parent = schema._zod.parent;
				if (parent) {
					if (!result.ref) result.ref = parent;
					process(parent, ctx, params);
					ctx.seen.get(parent).isParent = true;
				}
			}
			const meta = ctx.metadataRegistry.get(schema);
			if (meta) Object.assign(result.schema, meta);
			if (ctx.io === "input" && isTransforming(schema)) {
				delete result.schema.examples;
				delete result.schema.default;
			}
			if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
			delete result.schema._prefault;
			return ctx.seen.get(schema).schema;
		}
		function extractDefs(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const idToSchema = /* @__PURE__ */ new Map();
			for (const entry of ctx.seen.entries()) {
				const id = ctx.metadataRegistry.get(entry[0])?.id;
				if (id) {
					const existing = idToSchema.get(id);
					if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
					idToSchema.set(id, entry[0]);
				}
			}
			const makeURI = (entry) => {
				const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
				if (ctx.external) {
					const externalId = ctx.external.registry.get(entry[0])?.id;
					const uriGenerator = ctx.external.uri ?? ((id) => id);
					if (externalId) return { ref: uriGenerator(externalId) };
					const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
					entry[1].defId = id;
					return {
						defId: id,
						ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
					};
				}
				if (entry[1] === root) return { ref: "#" };
				const defUriPrefix = `#/${defsSegment}/`;
				const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
				return {
					defId,
					ref: defUriPrefix + defId
				};
			};
			const extractToDef = (entry) => {
				if (entry[1].schema.$ref) return;
				const seen = entry[1];
				const { ref, defId } = makeURI(entry);
				seen.def = { ...seen.schema };
				if (defId) seen.defId = defId;
				const schema = seen.schema;
				for (const key in schema) delete schema[key];
				schema.$ref = ref;
			};
			if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
			}
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (schema === entry[0]) {
					extractToDef(entry);
					continue;
				}
				if (ctx.external) {
					const ext = ctx.external.registry.get(entry[0])?.id;
					if (schema !== entry[0] && ext) {
						extractToDef(entry);
						continue;
					}
				}
				if (ctx.metadataRegistry.get(entry[0])?.id) {
					extractToDef(entry);
					continue;
				}
				if (seen.cycle) {
					extractToDef(entry);
					continue;
				}
				if (seen.count > 1) {
					if (ctx.reused === "ref") {
						extractToDef(entry);
						continue;
					}
				}
			}
		}
		function finalize(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const flattenRef = (zodSchema) => {
				const seen = ctx.seen.get(zodSchema);
				if (seen.ref === null) return;
				const schema = seen.def ?? seen.schema;
				const _cached = { ...schema };
				const ref = seen.ref;
				seen.ref = null;
				if (ref) {
					flattenRef(ref);
					const refSeen = ctx.seen.get(ref);
					const refSchema = refSeen.schema;
					if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
						schema.allOf = schema.allOf ?? [];
						schema.allOf.push(refSchema);
					} else Object.assign(schema, refSchema);
					Object.assign(schema, _cached);
					if (zodSchema._zod.parent === ref) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (!(key in _cached)) delete schema[key];
					}
					if (refSchema.$ref && refSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
					}
				}
				const parent = zodSchema._zod.parent;
				if (parent && parent !== ref) {
					flattenRef(parent);
					const parentSeen = ctx.seen.get(parent);
					if (parentSeen?.schema.$ref) {
						schema.$ref = parentSeen.schema.$ref;
						if (parentSeen.def) for (const key in schema) {
							if (key === "$ref" || key === "allOf") continue;
							if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
						}
					}
				}
				ctx.override({
					zodSchema,
					jsonSchema: schema,
					path: seen.path ?? []
				});
			};
			for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
			const result = {};
			if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
			else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
			else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
			else if (ctx.target === "openapi-3.0") {}
			if (ctx.external?.uri) {
				const id = ctx.external.registry.get(schema)?.id;
				if (!id) throw new Error("Schema is missing an `id` property");
				result.$id = ctx.external.uri(id);
			}
			Object.assign(result, root.def ?? root.schema);
			const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
			if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
			const defs = ctx.external?.defs ?? {};
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.def && seen.defId) {
					if (seen.def.id === seen.defId) delete seen.def.id;
					defs[seen.defId] = seen.def;
				}
			}
			if (ctx.external) {} else if (Object.keys(defs).length > 0) {
				if (ctx.target === "draft-2020-12") result.$defs = defs;
				else result.definitions = defs;
			}
			try {
				const finalized = JSON.parse(JSON.stringify(result));
				Object.defineProperty(finalized, "~standard", {
					value: {
						...schema["~standard"],
						jsonSchema: {
							input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
							output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
						}
					},
					enumerable: false,
					writable: false
				});
				return finalized;
			} catch (_err) {
				throw new Error("Error converting schema to JSON.");
			}
		}
		function isTransforming(_schema, _ctx) {
			const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
			if (ctx.seen.has(_schema)) return false;
			ctx.seen.add(_schema);
			const def = _schema._zod.def;
			if (def.type === "transform") return true;
			if (def.type === "array") return isTransforming(def.element, ctx);
			if (def.type === "set") return isTransforming(def.valueType, ctx);
			if (def.type === "lazy") return isTransforming(def.getter(), ctx);
			if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
			if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
			if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
			if (def.type === "pipe") {
				if (_schema._zod.traits.has("$ZodCodec")) return true;
				return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
			}
			if (def.type === "object") {
				for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
				return false;
			}
			if (def.type === "union") {
				for (const option of def.options) if (isTransforming(option, ctx)) return true;
				return false;
			}
			if (def.type === "tuple") {
				for (const item of def.items) if (isTransforming(item, ctx)) return true;
				if (def.rest && isTransforming(def.rest, ctx)) return true;
				return false;
			}
			return false;
		}
		/**
		* Creates a toJSONSchema method for a schema instance.
		* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
		*/
		const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
			const ctx = initializeContext({
				...params,
				processors
			});
			process(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
			const { libraryOptions, target } = params ?? {};
			const ctx = initializeContext({
				...libraryOptions ?? {},
				target,
				io,
				processors
			});
			process(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const stringProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			json.type = "string";
			const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
			if (typeof minimum === "number") json.minLength = minimum;
			if (typeof maximum === "number") json.maxLength = maximum;
			if (format) {
				json.format = formatMap[format] ?? format;
				if (json.format === "") delete json.format;
				if (format === "time") delete json.format;
			}
			if (contentEncoding) json.contentEncoding = contentEncoding;
			if (patterns && patterns.size > 0) {
				const regexes = [...patterns];
				if (regexes.length === 1) json.pattern = regexes[0].source;
				else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
					...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
					pattern: regex.source
				}))];
			}
		};
		const numberProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
			if (typeof format === "string" && format.includes("int")) json.type = "integer";
			else json.type = "number";
			const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
			const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
			const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
			if (exMin) {
				if (legacy) {
					json.minimum = exclusiveMinimum;
					json.exclusiveMinimum = true;
				} else json.exclusiveMinimum = exclusiveMinimum;
			} else if (typeof minimum === "number") json.minimum = minimum;
			if (exMax) {
				if (legacy) {
					json.maximum = exclusiveMaximum;
					json.exclusiveMaximum = true;
				} else json.exclusiveMaximum = exclusiveMaximum;
			} else if (typeof maximum === "number") json.maximum = maximum;
			if (typeof multipleOf === "number") json.multipleOf = multipleOf;
		};
		const booleanProcessor = (_schema, _ctx, json, _params) => {
			json.type = "boolean";
		};
		const undefinedProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Undefined cannot be represented in JSON Schema");
		};
		const neverProcessor = (_schema, _ctx, json, _params) => {
			json.not = {};
		};
		const enumProcessor = (schema, _ctx, json, _params) => {
			const def = schema._zod.def;
			const values = getEnumValues(def.entries);
			if (values.every((v) => typeof v === "number")) json.type = "number";
			if (values.every((v) => typeof v === "string")) json.type = "string";
			json.enum = values;
		};
		const literalProcessor = (schema, ctx, json, _params) => {
			const def = schema._zod.def;
			const vals = [];
			for (const val of def.values) if (val === void 0) {
				if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
			} else if (typeof val === "bigint") {
				if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
				else vals.push(Number(val));
			} else vals.push(val);
			if (vals.length === 0) {} else if (vals.length === 1) {
				const val = vals[0];
				json.type = val === null ? "null" : typeof val;
				if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
				else json.const = val;
			} else {
				if (vals.every((v) => typeof v === "number")) json.type = "number";
				if (vals.every((v) => typeof v === "string")) json.type = "string";
				if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
				if (vals.every((v) => v === null)) json.type = "null";
				json.enum = vals;
			}
		};
		const customProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
		};
		const transformProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
		};
		const arrayProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const { minimum, maximum } = schema._zod.bag;
			if (typeof minimum === "number") json.minItems = minimum;
			if (typeof maximum === "number") json.maxItems = maximum;
			json.type = "array";
			json.items = process(def.element, ctx, {
				...params,
				path: [...params.path, "items"]
			});
		};
		const objectProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			json.type = "object";
			json.properties = {};
			const shape = def.shape;
			for (const key in shape) json.properties[key] = process(shape[key], ctx, {
				...params,
				path: [
					...params.path,
					"properties",
					key
				]
			});
			const allKeys = new Set(Object.keys(shape));
			const requiredKeys = new Set([...allKeys].filter((key) => {
				const v = def.shape[key]._zod;
				if (ctx.io === "input") return v.optin === void 0;
				else return v.optout === void 0;
			}));
			if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
			if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
			else if (!def.catchall) {
				if (ctx.io === "output") json.additionalProperties = false;
			} else if (def.catchall) json.additionalProperties = process(def.catchall, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		};
		const unionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const isExclusive = def.inclusive === false;
			const options = def.options.map((x, i) => process(x, ctx, {
				...params,
				path: [
					...params.path,
					isExclusive ? "oneOf" : "anyOf",
					i
				]
			}));
			if (isExclusive) json.oneOf = options;
			else json.anyOf = options;
		};
		const intersectionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const a = process(def.left, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					0
				]
			});
			const b = process(def.right, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					1
				]
			});
			const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
			json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
		};
		const recordProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			json.type = "object";
			const keyType = def.keyType;
			const patterns = keyType._zod.bag?.patterns;
			if (def.mode === "loose" && patterns && patterns.size > 0) {
				const valueSchema = process(def.valueType, ctx, {
					...params,
					path: [
						...params.path,
						"patternProperties",
						"*"
					]
				});
				json.patternProperties = {};
				for (const pattern of patterns) json.patternProperties[pattern.source] = valueSchema;
			} else {
				if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") json.propertyNames = process(def.keyType, ctx, {
					...params,
					path: [...params.path, "propertyNames"]
				});
				json.additionalProperties = process(def.valueType, ctx, {
					...params,
					path: [...params.path, "additionalProperties"]
				});
			}
			const keyValues = keyType._zod.values;
			if (keyValues) {
				const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
				if (validKeyValues.length > 0) json.required = validKeyValues;
			}
		};
		const nullableProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const inner = process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			if (ctx.target === "openapi-3.0") {
				seen.ref = def.innerType;
				json.nullable = true;
			} else json.anyOf = [inner, { type: "null" }];
		};
		const nonoptionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		const defaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.default = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const prefaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const catchProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			let catchValue;
			try {
				catchValue = def.catchValue(void 0);
			} catch {
				throw new Error("Dynamic catch values are not supported in JSON Schema");
			}
			json.default = catchValue;
		};
		const pipeProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			const inIsTransform = def.in._zod.traits.has("$ZodTransform");
			const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
			process(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		const readonlyProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.readOnly = true;
		};
		const optionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		const lazyProcessor = (schema, ctx, _json, params) => {
			const innerType = schema._zod.innerType;
			process(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
		const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
			$ZodISODateTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function datetime(params) {
			return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
		}
		const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
			$ZodISODate.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function date(params) {
			return /* @__PURE__ */ _isoDate(ZodISODate, params);
		}
		const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
			$ZodISOTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function time(params) {
			return /* @__PURE__ */ _isoTime(ZodISOTime, params);
		}
		const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
			$ZodISODuration.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function duration(params) {
			return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
		}
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
		const initializer = (inst, issues) => {
			$ZodError.init(inst, issues);
			inst.name = "ZodError";
			Object.defineProperties(inst, {
				format: { value: (mapper) => formatError(inst, mapper) },
				flatten: { value: (mapper) => flattenError(inst, mapper) },
				addIssue: { value: (issue) => {
					inst.issues.push(issue);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				addIssues: { value: (issues) => {
					inst.issues.push(...issues);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				isEmpty: { get() {
					return inst.issues.length === 0;
				} }
			});
		};
		const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
		const parse = /* @__PURE__ */ _parse(ZodRealError);
		const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
		const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
		const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
		const encode = /* @__PURE__ */ _encode(ZodRealError);
		const decode = /* @__PURE__ */ _decode(ZodRealError);
		const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
		const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
		const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
		const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
		const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
		const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
		//#endregion
		//#region node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
		const _installedGroups = /* @__PURE__ */ new WeakMap();
		function _installLazyMethods(inst, group, methods) {
			const proto = Object.getPrototypeOf(inst);
			let installed = _installedGroups.get(proto);
			if (!installed) {
				installed = /* @__PURE__ */ new Set();
				_installedGroups.set(proto, installed);
			}
			if (installed.has(group)) return;
			installed.add(group);
			for (const key in methods) {
				const fn = methods[key];
				Object.defineProperty(proto, key, {
					configurable: true,
					enumerable: false,
					get() {
						const bound = fn.bind(this);
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: bound
						});
						return bound;
					},
					set(v) {
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: v
						});
					}
				});
			}
		}
		const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
			$ZodType.init(inst, def);
			Object.assign(inst["~standard"], { jsonSchema: {
				input: createStandardJSONSchemaMethod(inst, "input"),
				output: createStandardJSONSchemaMethod(inst, "output")
			} });
			inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
			inst.def = def;
			inst.type = def.type;
			Object.defineProperty(inst, "_def", { value: def });
			inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
			inst.safeParse = (data, params) => safeParse(inst, data, params);
			inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
			inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
			inst.spa = inst.safeParseAsync;
			inst.encode = (data, params) => encode(inst, data, params);
			inst.decode = (data, params) => decode(inst, data, params);
			inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
			inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
			inst.safeEncode = (data, params) => safeEncode(inst, data, params);
			inst.safeDecode = (data, params) => safeDecode(inst, data, params);
			inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
			inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
			_installLazyMethods(inst, "ZodType", {
				check(...chks) {
					const def = this.def;
					return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
						check: ch,
						def: { check: "custom" },
						onattach: []
					} } : ch)] }), { parent: true });
				},
				with(...chks) {
					return this.check(...chks);
				},
				clone(def, params) {
					return clone(this, def, params);
				},
				brand() {
					return this;
				},
				register(reg, meta) {
					reg.add(this, meta);
					return this;
				},
				refine(check, params) {
					return this.check(refine(check, params));
				},
				superRefine(refinement, params) {
					return this.check(superRefine(refinement, params));
				},
				overwrite(fn) {
					return this.check(/* @__PURE__ */ _overwrite(fn));
				},
				optional() {
					return optional(this);
				},
				exactOptional() {
					return exactOptional(this);
				},
				nullable() {
					return nullable(this);
				},
				nullish() {
					return optional(nullable(this));
				},
				nonoptional(params) {
					return nonoptional(this, params);
				},
				array() {
					return array(this);
				},
				or(arg) {
					return union([this, arg]);
				},
				and(arg) {
					return intersection(this, arg);
				},
				transform(tx) {
					return pipe(this, transform(tx));
				},
				default(d) {
					return _default(this, d);
				},
				prefault(d) {
					return prefault(this, d);
				},
				catch(params) {
					return _catch(this, params);
				},
				pipe(target) {
					return pipe(this, target);
				},
				readonly() {
					return readonly(this);
				},
				describe(description) {
					const cl = this.clone();
					globalRegistry.add(cl, { description });
					return cl;
				},
				meta(...args) {
					if (args.length === 0) return globalRegistry.get(this);
					const cl = this.clone();
					globalRegistry.add(cl, args[0]);
					return cl;
				},
				isOptional() {
					return this.safeParse(void 0).success;
				},
				isNullable() {
					return this.safeParse(null).success;
				},
				apply(fn) {
					return fn(this);
				}
			});
			Object.defineProperty(inst, "description", {
				get() {
					return globalRegistry.get(inst)?.description;
				},
				configurable: true
			});
			return inst;
		});
		/** @internal */
		const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
			const bag = inst._zod.bag;
			inst.format = bag.format ?? null;
			inst.minLength = bag.minimum ?? null;
			inst.maxLength = bag.maximum ?? null;
			_installLazyMethods(inst, "_ZodString", {
				regex(...args) {
					return this.check(/* @__PURE__ */ _regex(...args));
				},
				includes(...args) {
					return this.check(/* @__PURE__ */ _includes(...args));
				},
				startsWith(...args) {
					return this.check(/* @__PURE__ */ _startsWith(...args));
				},
				endsWith(...args) {
					return this.check(/* @__PURE__ */ _endsWith(...args));
				},
				min(...args) {
					return this.check(/* @__PURE__ */ _minLength(...args));
				},
				max(...args) {
					return this.check(/* @__PURE__ */ _maxLength(...args));
				},
				length(...args) {
					return this.check(/* @__PURE__ */ _length(...args));
				},
				nonempty(...args) {
					return this.check(/* @__PURE__ */ _minLength(1, ...args));
				},
				lowercase(params) {
					return this.check(/* @__PURE__ */ _lowercase(params));
				},
				uppercase(params) {
					return this.check(/* @__PURE__ */ _uppercase(params));
				},
				trim() {
					return this.check(/* @__PURE__ */ _trim());
				},
				normalize(...args) {
					return this.check(/* @__PURE__ */ _normalize(...args));
				},
				toLowerCase() {
					return this.check(/* @__PURE__ */ _toLowerCase());
				},
				toUpperCase() {
					return this.check(/* @__PURE__ */ _toUpperCase());
				},
				slugify() {
					return this.check(/* @__PURE__ */ _slugify());
				}
			});
		});
		const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			_ZodString.init(inst, def);
			inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
			inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
			inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
			inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
			inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
			inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
			inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
			inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
			inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
			inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
			inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
			inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
			inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
			inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
			inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
			inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
			inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
			inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
			inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
			inst.datetime = (params) => inst.check(datetime(params));
			inst.date = (params) => inst.check(date(params));
			inst.time = (params) => inst.check(time(params));
			inst.duration = (params) => inst.check(duration(params));
		});
		function string(params) {
			return /* @__PURE__ */ _string(ZodString, params);
		}
		const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			_ZodString.init(inst, def);
		});
		const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
			$ZodEmail.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
			$ZodGUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
			$ZodUUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
			$ZodURL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
			$ZodEmoji.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
			$ZodNanoID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
			$ZodCUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
			$ZodCUID2.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
			$ZodULID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
			$ZodXID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
			$ZodKSUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
			$ZodIPv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
			$ZodIPv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
			$ZodCIDRv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
			$ZodCIDRv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
			$ZodBase64.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
			$ZodBase64URL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
			$ZodE164.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
			$ZodJWT.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
			$ZodNumber.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
			_installLazyMethods(inst, "ZodNumber", {
				gt(value, params) {
					return this.check(/* @__PURE__ */ _gt(value, params));
				},
				gte(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				min(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				lt(value, params) {
					return this.check(/* @__PURE__ */ _lt(value, params));
				},
				lte(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				max(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				int(params) {
					return this.check(int(params));
				},
				safe(params) {
					return this.check(int(params));
				},
				positive(params) {
					return this.check(/* @__PURE__ */ _gt(0, params));
				},
				nonnegative(params) {
					return this.check(/* @__PURE__ */ _gte(0, params));
				},
				negative(params) {
					return this.check(/* @__PURE__ */ _lt(0, params));
				},
				nonpositive(params) {
					return this.check(/* @__PURE__ */ _lte(0, params));
				},
				multipleOf(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				step(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				finite() {
					return this;
				}
			});
			const bag = inst._zod.bag;
			inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
			inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
			inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
			inst.isFinite = true;
			inst.format = bag.format ?? null;
		});
		function number(params) {
			return /* @__PURE__ */ _number(ZodNumber, params);
		}
		const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
			$ZodNumberFormat.init(inst, def);
			ZodNumber.init(inst, def);
		});
		function int(params) {
			return /* @__PURE__ */ _int(ZodNumberFormat, params);
		}
		const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
			$ZodBoolean.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
		});
		function boolean(params) {
			return /* @__PURE__ */ _boolean(ZodBoolean, params);
		}
		const ZodUndefined = /*@__PURE__*/ $constructor("ZodUndefined", (inst, def) => {
			$ZodUndefined.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => undefinedProcessor(inst, ctx, json, params);
		});
		function _undefined(params) {
			return /* @__PURE__ */ _undefined$1(ZodUndefined, params);
		}
		const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
			$ZodUnknown.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => void 0;
		});
		function unknown() {
			return /* @__PURE__ */ _unknown(ZodUnknown);
		}
		const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
			$ZodNever.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
		});
		function never(params) {
			return /* @__PURE__ */ _never(ZodNever, params);
		}
		const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
			$ZodArray.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
			inst.element = def.element;
			_installLazyMethods(inst, "ZodArray", {
				min(n, params) {
					return this.check(/* @__PURE__ */ _minLength(n, params));
				},
				nonempty(params) {
					return this.check(/* @__PURE__ */ _minLength(1, params));
				},
				max(n, params) {
					return this.check(/* @__PURE__ */ _maxLength(n, params));
				},
				length(n, params) {
					return this.check(/* @__PURE__ */ _length(n, params));
				},
				unwrap() {
					return this.element;
				}
			});
		});
		function array(element, params) {
			return /* @__PURE__ */ _array(ZodArray, element, params);
		}
		const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
			$ZodObjectJIT.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
			defineLazy(inst, "shape", () => {
				return def.shape;
			});
			_installLazyMethods(inst, "ZodObject", {
				keyof() {
					return _enum(Object.keys(this._zod.def.shape));
				},
				catchall(catchall) {
					return this.clone({
						...this._zod.def,
						catchall
					});
				},
				passthrough() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				loose() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				strict() {
					return this.clone({
						...this._zod.def,
						catchall: never()
					});
				},
				strip() {
					return this.clone({
						...this._zod.def,
						catchall: void 0
					});
				},
				extend(incoming) {
					return extend(this, incoming);
				},
				safeExtend(incoming) {
					return safeExtend(this, incoming);
				},
				merge(other) {
					return merge(this, other);
				},
				pick(mask) {
					return pick(this, mask);
				},
				omit(mask) {
					return omit(this, mask);
				},
				partial(...args) {
					return partial(ZodOptional, this, args[0]);
				},
				required(...args) {
					return required(ZodNonOptional, this, args[0]);
				}
			});
		});
		function object(shape, params) {
			const def = {
				type: "object",
				shape: shape ?? {},
				...normalizeParams(params)
			};
			return new ZodObject(def);
		}
		const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
			$ZodUnion.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
			inst.options = def.options;
		});
		function union(options, params) {
			return new ZodUnion({
				type: "union",
				options,
				...normalizeParams(params)
			});
		}
		const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
			$ZodIntersection.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
		});
		function intersection(left, right) {
			return new ZodIntersection({
				type: "intersection",
				left,
				right
			});
		}
		const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
			$ZodRecord.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
			inst.keyType = def.keyType;
			inst.valueType = def.valueType;
		});
		function record(keyType, valueType, params) {
			if (!valueType || !valueType._zod) return new ZodRecord({
				type: "record",
				keyType: string(),
				valueType: keyType,
				...normalizeParams(valueType)
			});
			return new ZodRecord({
				type: "record",
				keyType,
				valueType,
				...normalizeParams(params)
			});
		}
		const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
			$ZodEnum.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
			inst.enum = def.entries;
			inst.options = Object.values(def.entries);
			const keys = new Set(Object.keys(def.entries));
			inst.extract = (values, params) => {
				const newEntries = {};
				for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
			inst.exclude = (values, params) => {
				const newEntries = { ...def.entries };
				for (const value of values) if (keys.has(value)) delete newEntries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
		});
		function _enum(values, params) {
			const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
			return new ZodEnum({
				type: "enum",
				entries,
				...normalizeParams(params)
			});
		}
		const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
			$ZodLiteral.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
			inst.values = new Set(def.values);
			Object.defineProperty(inst, "value", { get() {
				if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
				return def.values[0];
			} });
		});
		function literal(value, params) {
			return new ZodLiteral({
				type: "literal",
				values: Array.isArray(value) ? value : [value],
				...normalizeParams(params)
			});
		}
		const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
			$ZodTransform.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
			inst._zod.parse = (payload, _ctx) => {
				if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				payload.addIssue = (issue$1) => {
					if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
					else {
						const _issue = issue$1;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = inst);
						payload.issues.push(issue(_issue));
					}
				};
				const output = def.transform(payload.value, payload);
				if (output instanceof Promise) return output.then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				payload.value = output;
				payload.fallback = true;
				return payload;
			};
		});
		function transform(fn) {
			return new ZodTransform({
				type: "transform",
				transform: fn
			});
		}
		const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function optional(innerType) {
			return new ZodOptional({
				type: "optional",
				innerType
			});
		}
		const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
			$ZodExactOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function exactOptional(innerType) {
			return new ZodExactOptional({
				type: "optional",
				innerType
			});
		}
		const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
			$ZodNullable.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nullable(innerType) {
			return new ZodNullable({
				type: "nullable",
				innerType
			});
		}
		const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
			$ZodDefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeDefault = inst.unwrap;
		});
		function _default(innerType, defaultValue) {
			return new ZodDefault({
				type: "default",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
			$ZodPrefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function prefault(innerType, defaultValue) {
			return new ZodPrefault({
				type: "prefault",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
			$ZodNonOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nonoptional(innerType, params) {
			return new ZodNonOptional({
				type: "nonoptional",
				innerType,
				...normalizeParams(params)
			});
		}
		const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
			$ZodCatch.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeCatch = inst.unwrap;
		});
		function _catch(innerType, catchValue) {
			return new ZodCatch({
				type: "catch",
				innerType,
				catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
			});
		}
		const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
			$ZodPipe.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
			inst.in = def.in;
			inst.out = def.out;
		});
		function pipe(in_, out) {
			return new ZodPipe({
				type: "pipe",
				in: in_,
				out
			});
		}
		const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
			$ZodReadonly.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function readonly(innerType) {
			return new ZodReadonly({
				type: "readonly",
				innerType
			});
		}
		const ZodLazy = /*@__PURE__*/ $constructor("ZodLazy", (inst, def) => {
			$ZodLazy.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => lazyProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.getter();
		});
		function lazy(getter) {
			return new ZodLazy({
				type: "lazy",
				getter
			});
		}
		const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
			$ZodCustom.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
		});
		function refine(fn, _params = {}) {
			return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
		}
		function superRefine(fn, params) {
			return /* @__PURE__ */ _superRefine(fn, params);
		}
		//#endregion
		//#region lib/typert.remote-client.js
		const JsonValueRemoteCodec$schema = union([
			literal(null),
			string(),
			number(),
			literal(false),
			literal(true),
			array(lazy(() => JsonValueRemoteCodec$schema)),
			record(string(), lazy(() => JsonValueRemoteCodec$schema)).readonly()
		]);
		const JsonValueRemoteCodec$schema2 = union([
			literal(null),
			string(),
			number(),
			literal(false),
			literal(true),
			array(lazy(() => JsonValueRemoteCodec$schema2)),
			record(string(), lazy(() => JsonValueRemoteCodec$schema2)).readonly()
		]);
		const _zaalipro_dsh_workflows_workflowDefinitions_list_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowDefinitions_list_parameter_1$schema = object({
			"cursor": union([_undefined(), string()]).readonly().optional(),
			"limit": union([_undefined(), number()]).readonly().optional()
		});
		const _zaalipro_dsh_workflows_workflowDefinitions_list_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"items": array(object({
					"name": string().readonly(),
					"description": string().readonly(),
					"whenToUse": union([_undefined(), string()]).readonly().optional(),
					"scope": union([
						literal("bundled"),
						literal("project"),
						literal("user")
					]).readonly()
				})).readonly(),
				"nextCursor": union([_undefined(), string()]).readonly().optional(),
				"total": number().readonly(),
				"revision": number().readonly()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_artifact_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_artifact_parameter_1$schema = object({
			"name": string().readonly(),
			"cursor": union([_undefined(), string()]).readonly().optional(),
			"maxBytes": union([_undefined(), number()]).readonly().optional(),
			"expectedRevision": union([_undefined(), number()]).readonly().optional(),
			"runId": string().readonly()
		});
		const _zaalipro_dsh_workflows_workflowRuns_artifact_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"artifact": object({
					"name": string().readonly(),
					"bytes": number().readonly()
				}).readonly(),
				"text": string().readonly(),
				"offsetBytes": number().readonly(),
				"returnedBytes": number().readonly(),
				"totalBytes": number().readonly(),
				"revision": number().readonly(),
				"nextCursor": union([_undefined(), string()]).readonly().optional()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_artifacts_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_artifacts_parameter_1$schema = object({
			"cursor": union([_undefined(), string()]).readonly().optional(),
			"limit": union([_undefined(), number()]).readonly().optional(),
			"runId": string().readonly()
		});
		const _zaalipro_dsh_workflows_workflowRuns_artifacts_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"items": array(object({
					"name": string().readonly(),
					"bytes": number().readonly()
				})).readonly(),
				"nextCursor": union([_undefined(), string()]).readonly().optional(),
				"omitted": number().readonly(),
				"total": number().readonly(),
				"revision": number().readonly()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_control_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_control_parameter_1$schema = object({
			"action": union([
				literal("pause"),
				literal("resume"),
				literal("stop"),
				literal("save")
			]).readonly(),
			"expectedRevision": number().readonly(),
			"runId": string().readonly()
		});
		const _zaalipro_dsh_workflows_workflowRuns_control_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({ "run": object({
				"runId": string().readonly(),
				"displayName": string().readonly(),
				"name": string().readonly(),
				"description": string().readonly(),
				"status": union([
					literal("running"),
					literal("pausing"),
					literal("stopping"),
					literal("needs-input"),
					literal("paused"),
					literal("budget-limited"),
					literal("completed"),
					literal("failed"),
					literal("cancelled"),
					literal("interrupted")
				]).readonly(),
				"phase": union([_undefined(), string()]).readonly().optional(),
				"budget": object({
					"total": number().readonly(),
					"spent": number().readonly(),
					"remaining": number().readonly()
				}).readonly(),
				"memberCounts": object({
					"total": number().readonly(),
					"running": number().readonly(),
					"completed": number().readonly(),
					"failed": number().readonly(),
					"cancelled": number().readonly()
				}).readonly(),
				"startedAt": number().readonly(),
				"settledAt": union([_undefined(), number()]).readonly().optional(),
				"terminal": union([_undefined(), object({
					"stopReason": union([
						literal("completed"),
						literal("cancelled"),
						literal("interrupted"),
						literal("error")
					]).readonly(),
					"resultState": union([
						literal("available"),
						literal("not-produced"),
						literal("evicted")
					]).readonly(),
					"preview": union([_undefined(), string()]).readonly().optional(),
					"error": union([_undefined(), string()]).readonly().optional()
				})]).readonly().optional(),
				"allowedActions": array(union([
					literal("pause"),
					literal("resume"),
					literal("stop"),
					literal("save")
				])).readonly(),
				"revision": number().readonly(),
				"detailRevision": number().readonly(),
				"membersRevision": number().readonly(),
				"logsRevision": number().readonly(),
				"resultRevision": number().readonly(),
				"artifactsRevision": number().readonly()
			}).readonly() }).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_detail_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_detail_parameter_1$schema = object({ "runId": string().readonly() });
		const _zaalipro_dsh_workflows_workflowRuns_detail_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"run": object({
					"runId": string().readonly(),
					"displayName": string().readonly(),
					"name": string().readonly(),
					"description": string().readonly(),
					"status": union([
						literal("running"),
						literal("pausing"),
						literal("stopping"),
						literal("needs-input"),
						literal("paused"),
						literal("budget-limited"),
						literal("completed"),
						literal("failed"),
						literal("cancelled"),
						literal("interrupted")
					]).readonly(),
					"phase": union([_undefined(), string()]).readonly().optional(),
					"budget": object({
						"total": number().readonly(),
						"spent": number().readonly(),
						"remaining": number().readonly()
					}).readonly(),
					"memberCounts": object({
						"total": number().readonly(),
						"running": number().readonly(),
						"completed": number().readonly(),
						"failed": number().readonly(),
						"cancelled": number().readonly()
					}).readonly(),
					"startedAt": number().readonly(),
					"settledAt": union([_undefined(), number()]).readonly().optional(),
					"terminal": union([_undefined(), object({
						"stopReason": union([
							literal("completed"),
							literal("cancelled"),
							literal("interrupted"),
							literal("error")
						]).readonly(),
						"resultState": union([
							literal("available"),
							literal("not-produced"),
							literal("evicted")
						]).readonly(),
						"preview": union([_undefined(), string()]).readonly().optional(),
						"error": union([_undefined(), string()]).readonly().optional()
					})]).readonly().optional(),
					"allowedActions": array(union([
						literal("pause"),
						literal("resume"),
						literal("stop"),
						literal("save")
					])).readonly(),
					"revision": number().readonly(),
					"detailRevision": number().readonly(),
					"membersRevision": number().readonly(),
					"logsRevision": number().readonly(),
					"resultRevision": number().readonly(),
					"artifactsRevision": number().readonly()
				}).readonly(),
				"phases": union([_undefined(), array(object({
					"title": string().readonly(),
					"detail": union([_undefined(), string()]).readonly().optional(),
					"provider": union([_undefined(), string()]).readonly().optional(),
					"model": union([_undefined(), string()]).readonly().optional()
				}))]).readonly().optional(),
				"gate": union([_undefined(), object({
					"id": union([_undefined(), string()]).readonly().optional(),
					"kind": union([
						literal("user"),
						literal("back_off"),
						literal("no_progress"),
						literal("verification"),
						literal("infra")
					]).readonly(),
					"message": string().readonly(),
					"resumable": boolean().readonly()
				})]).readonly().optional(),
				"error": union([_undefined(), string()]).readonly().optional(),
				"scriptPath": union([_undefined(), string()]).readonly().optional()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_list_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_list_parameter_1$schema = object({
			"cursor": union([_undefined(), string()]).readonly().optional(),
			"limit": union([_undefined(), number()]).readonly().optional()
		});
		const _zaalipro_dsh_workflows_workflowRuns_list_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"epoch": string().readonly(),
				"sessionRevision": number().readonly(),
				"items": array(object({
					"runId": string().readonly(),
					"displayName": string().readonly(),
					"name": string().readonly(),
					"description": string().readonly(),
					"status": union([
						literal("running"),
						literal("pausing"),
						literal("stopping"),
						literal("needs-input"),
						literal("paused"),
						literal("budget-limited"),
						literal("completed"),
						literal("failed"),
						literal("cancelled"),
						literal("interrupted")
					]).readonly(),
					"phase": union([_undefined(), string()]).readonly().optional(),
					"budget": object({
						"total": number().readonly(),
						"spent": number().readonly(),
						"remaining": number().readonly()
					}).readonly(),
					"memberCounts": object({
						"total": number().readonly(),
						"running": number().readonly(),
						"completed": number().readonly(),
						"failed": number().readonly(),
						"cancelled": number().readonly()
					}).readonly(),
					"startedAt": number().readonly(),
					"settledAt": union([_undefined(), number()]).readonly().optional(),
					"terminal": union([_undefined(), object({
						"stopReason": union([
							literal("completed"),
							literal("cancelled"),
							literal("interrupted"),
							literal("error")
						]).readonly(),
						"resultState": union([
							literal("available"),
							literal("not-produced"),
							literal("evicted")
						]).readonly(),
						"preview": union([_undefined(), string()]).readonly().optional(),
						"error": union([_undefined(), string()]).readonly().optional()
					})]).readonly().optional(),
					"allowedActions": array(union([
						literal("pause"),
						literal("resume"),
						literal("stop"),
						literal("save")
					])).readonly(),
					"revision": number().readonly(),
					"detailRevision": number().readonly(),
					"membersRevision": number().readonly(),
					"logsRevision": number().readonly(),
					"resultRevision": number().readonly(),
					"artifactsRevision": number().readonly()
				})).readonly(),
				"nextCursor": union([_undefined(), string()]).readonly().optional(),
				"total": number().readonly()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_logs_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_logs_parameter_1$schema = object({
			"cursor": union([_undefined(), string()]).readonly().optional(),
			"limit": union([_undefined(), number()]).readonly().optional(),
			"runId": string().readonly()
		});
		const _zaalipro_dsh_workflows_workflowRuns_logs_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"items": array(object({
					"index": number().readonly(),
					"text": string().readonly()
				})).readonly(),
				"nextCursor": union([_undefined(), string()]).readonly().optional(),
				"evicted": number().readonly(),
				"total": number().readonly(),
				"revision": number().readonly()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_memberDetail_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_memberDetail_parameter_1$schema = object({
			"memberId": string().readonly(),
			"runId": string().readonly()
		});
		const _zaalipro_dsh_workflows_workflowRuns_memberDetail_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"member": object({
					"memberId": string().readonly(),
					"seq": number().readonly(),
					"label": string().readonly(),
					"phase": union([_undefined(), string()]).readonly().optional(),
					"status": union([
						literal("running"),
						literal("completed"),
						literal("failed"),
						literal("cancelled")
					]).readonly(),
					"startedAt": union([_undefined(), number()]).readonly().optional(),
					"settledAt": union([_undefined(), number()]).readonly().optional(),
					"outcome": union([
						literal("pending"),
						literal("available"),
						literal("not-produced"),
						literal("evicted")
					]).readonly(),
					"childSessionId": union([_undefined(), string()]).readonly().optional()
				}).readonly(),
				"childSessionId": union([_undefined(), string()]).readonly().optional(),
				"outcome": union([object({ "state": union([
					literal("pending"),
					literal("not-produced"),
					literal("evicted")
				]).readonly() }), object({
					"state": literal("available").readonly(),
					"content": union([object({
						"kind": literal("value").readonly(),
						"value": union([
							literal(null),
							string(),
							number(),
							literal(false),
							literal(true),
							array(lazy(() => JsonValueRemoteCodec$schema)),
							record(string(), lazy(() => JsonValueRemoteCodec$schema)).readonly()
						]).readonly()
					}), object({
						"kind": literal("preview").readonly(),
						"text": string().readonly()
					})]).readonly(),
					"totalBytes": number().readonly(),
					"truncated": boolean().readonly()
				})]).readonly()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_members_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_members_parameter_1$schema = object({
			"cursor": union([_undefined(), string()]).readonly().optional(),
			"limit": union([_undefined(), number()]).readonly().optional(),
			"runId": string().readonly()
		});
		const _zaalipro_dsh_workflows_workflowRuns_members_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"items": array(object({
					"memberId": string().readonly(),
					"seq": number().readonly(),
					"label": string().readonly(),
					"phase": union([_undefined(), string()]).readonly().optional(),
					"status": union([
						literal("running"),
						literal("completed"),
						literal("failed"),
						literal("cancelled")
					]).readonly(),
					"startedAt": union([_undefined(), number()]).readonly().optional(),
					"settledAt": union([_undefined(), number()]).readonly().optional(),
					"outcome": union([
						literal("pending"),
						literal("available"),
						literal("not-produced"),
						literal("evicted")
					]).readonly(),
					"childSessionId": union([_undefined(), string()]).readonly().optional()
				})).readonly(),
				"nextCursor": union([_undefined(), string()]).readonly().optional(),
				"total": number().readonly(),
				"revision": number().readonly()
			}).readonly()
		})]);
		const _zaalipro_dsh_workflows_workflowRuns_result_parameter_0$schema = intersection(string(), unknown());
		const _zaalipro_dsh_workflows_workflowRuns_result_parameter_1$schema = object({ "runId": string().readonly() });
		const _zaalipro_dsh_workflows_workflowRuns_result_result$schema = union([object({
			"ok": literal(false).readonly(),
			"error": union([
				object({
					"code": union([
						literal("invalid-page-limit"),
						literal("invalid-artifact-limit"),
						literal("invalid-cursor"),
						literal("stale-cursor"),
						literal("workspace-unavailable"),
						literal("definition-invalid"),
						literal("run-not-found"),
						literal("member-not-found"),
						literal("artifact-not-found"),
						literal("artifact-changed"),
						literal("storage-unavailable")
					]).readonly(),
					"message": string().readonly(),
					"details": union([_undefined(), object({
						"min": union([_undefined(), number()]).readonly().optional(),
						"max": union([_undefined(), number()]).readonly().optional(),
						"revision": union([_undefined(), number()]).readonly().optional()
					})]).readonly().optional()
				}),
				object({
					"code": literal("revision-conflict").readonly(),
					"message": literal("workflow run changed; refresh it before applying a control").readonly(),
					"details": object({ "run": object({
						"runId": string().readonly(),
						"displayName": string().readonly(),
						"name": string().readonly(),
						"description": string().readonly(),
						"status": union([
							literal("running"),
							literal("pausing"),
							literal("stopping"),
							literal("needs-input"),
							literal("paused"),
							literal("budget-limited"),
							literal("completed"),
							literal("failed"),
							literal("cancelled"),
							literal("interrupted")
						]).readonly(),
						"phase": union([_undefined(), string()]).readonly().optional(),
						"budget": object({
							"total": number().readonly(),
							"spent": number().readonly(),
							"remaining": number().readonly()
						}).readonly(),
						"memberCounts": object({
							"total": number().readonly(),
							"running": number().readonly(),
							"completed": number().readonly(),
							"failed": number().readonly(),
							"cancelled": number().readonly()
						}).readonly(),
						"startedAt": number().readonly(),
						"settledAt": union([_undefined(), number()]).readonly().optional(),
						"terminal": union([_undefined(), object({
							"stopReason": union([
								literal("completed"),
								literal("cancelled"),
								literal("interrupted"),
								literal("error")
							]).readonly(),
							"resultState": union([
								literal("available"),
								literal("not-produced"),
								literal("evicted")
							]).readonly(),
							"preview": union([_undefined(), string()]).readonly().optional(),
							"error": union([_undefined(), string()]).readonly().optional()
						})]).readonly().optional(),
						"allowedActions": array(union([
							literal("pause"),
							literal("resume"),
							literal("stop"),
							literal("save")
						])).readonly(),
						"revision": number().readonly(),
						"detailRevision": number().readonly(),
						"membersRevision": number().readonly(),
						"logsRevision": number().readonly(),
						"resultRevision": number().readonly(),
						"artifactsRevision": number().readonly()
					}).readonly() }).readonly()
				}),
				object({
					"code": literal("action-unavailable").readonly(),
					"message": string().readonly(),
					"details": object({
						"reason": union([
							literal("budget-limited"),
							literal("invalid-state"),
							literal("save-ineligible")
						]).readonly(),
						"run": union([_undefined(), object({
							"runId": string().readonly(),
							"displayName": string().readonly(),
							"name": string().readonly(),
							"description": string().readonly(),
							"status": union([
								literal("running"),
								literal("pausing"),
								literal("stopping"),
								literal("needs-input"),
								literal("paused"),
								literal("budget-limited"),
								literal("completed"),
								literal("failed"),
								literal("cancelled"),
								literal("interrupted")
							]).readonly(),
							"phase": union([_undefined(), string()]).readonly().optional(),
							"budget": object({
								"total": number().readonly(),
								"spent": number().readonly(),
								"remaining": number().readonly()
							}).readonly(),
							"memberCounts": object({
								"total": number().readonly(),
								"running": number().readonly(),
								"completed": number().readonly(),
								"failed": number().readonly(),
								"cancelled": number().readonly()
							}).readonly(),
							"startedAt": number().readonly(),
							"settledAt": union([_undefined(), number()]).readonly().optional(),
							"terminal": union([_undefined(), object({
								"stopReason": union([
									literal("completed"),
									literal("cancelled"),
									literal("interrupted"),
									literal("error")
								]).readonly(),
								"resultState": union([
									literal("available"),
									literal("not-produced"),
									literal("evicted")
								]).readonly(),
								"preview": union([_undefined(), string()]).readonly().optional(),
								"error": union([_undefined(), string()]).readonly().optional()
							})]).readonly().optional(),
							"allowedActions": array(union([
								literal("pause"),
								literal("resume"),
								literal("stop"),
								literal("save")
							])).readonly(),
							"revision": number().readonly(),
							"detailRevision": number().readonly(),
							"membersRevision": number().readonly(),
							"logsRevision": number().readonly(),
							"resultRevision": number().readonly(),
							"artifactsRevision": number().readonly()
						})]).readonly().optional()
					}).readonly()
				})
			]).readonly()
		}), object({
			"ok": literal(true).readonly(),
			"value": object({
				"value": union([object({ "state": union([
					literal("pending"),
					literal("not-produced"),
					literal("evicted")
				]).readonly() }), object({
					"state": literal("available").readonly(),
					"content": union([object({
						"kind": literal("value").readonly(),
						"value": union([
							literal(null),
							string(),
							number(),
							literal(false),
							literal(true),
							array(lazy(() => JsonValueRemoteCodec$schema2)),
							record(string(), lazy(() => JsonValueRemoteCodec$schema2)).readonly()
						]).readonly()
					}), object({
						"kind": literal("preview").readonly(),
						"text": string().readonly()
					})]).readonly(),
					"totalBytes": number().readonly(),
					"truncated": boolean().readonly()
				})]).readonly(),
				"error": union([_undefined(), string()]).readonly().optional(),
				"revision": number().readonly()
			}).readonly()
		})]);
		const TYPERT_REMOTE = {
			package: "@zaalipro/dsh-workflows",
			descriptors: [
				{
					id: "@zaalipro/dsh-workflows#workflowDefinitions/list",
					service: "workflowDefinitionsRemote",
					namespace: "workflowDefinitions",
					method: "list",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowDefinitions_list_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/registry#WorkflowDefinitionListRequest",
							schema: _zaalipro_dsh_workflows_workflowDefinitions_list_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowDefinitions_list_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/registry/remote.ts",
						"line": 51,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/artifact",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "artifact",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_artifact_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunArtifactRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_artifact_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_artifact_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 318,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/artifacts",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "artifacts",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_artifacts_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunArtifactsRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_artifacts_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_artifacts_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 312,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/control",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "control",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_control_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunControlRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_control_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_control_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 381,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/detail",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "detail",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_detail_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_detail_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_detail_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 230,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/list",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "list",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_list_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunListRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_list_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_list_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 194,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/logs",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "logs",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_logs_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunLogsRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_logs_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_logs_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 293,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/memberDetail",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "memberDetail",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_memberDetail_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunMemberRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_memberDetail_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_memberDetail_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 280,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/members",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "members",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_members_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunMembersRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_members_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_members_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 274,
						"column": 9
					}
				},
				{
					id: "@zaalipro/dsh-workflows#workflowRuns/result",
					service: "workflowRunsRemote",
					namespace: "workflowRuns",
					method: "result",
					invocation: { kind: "direct" },
					scope: {
						context: "agent",
						wire: "agentId"
					},
					parameters: [{
						name: "agent",
						wire: "agentId",
						source: "lookup",
						lookup: "agent",
						codec: {
							mode: "strict",
							typeSymbol: "@deepseek-ai/dsh-session/types#SessionId",
							schema: _zaalipro_dsh_workflows_workflowRuns_result_parameter_0$schema
						}
					}, {
						name: "request",
						wire: "request",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRunRequest",
							schema: _zaalipro_dsh_workflows_workflowRuns_result_parameter_1$schema
						}
					}],
					cancellation: { parameter: "signal" },
					result: {
						mode: "strict",
						typeSymbol: "@zaalipro/dsh-workflows/supervisor#WorkflowRemoteResult",
						schema: _zaalipro_dsh_workflows_workflowRuns_result_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-workflows/src/supervisor/remote.ts",
						"line": 299,
						"column": 9
					}
				}
			]
		};
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
			listDefinitions;
			launchDefinition;
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
			connection;
			states = /* @__PURE__ */ new Map();
			parentRemote;
			agents;
			connectionGeneration = 0;
			connected = true;
			observed;
			disposed = false;
			constructor(remote, agents, connection) {
				this.connection = connection;
				this.parentRemote = remote;
				this.agents = agents;
			}
			/** Resolve after typert $mount; construction may run before the namespace exists. */
			get remote() {
				return this.parentRemote?.workflowRuns ?? this.parentRemote;
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
				if (this.observed === sessionId) {
					if (sessionId !== void 0 && !this.disposed) this.refresh(sessionId).catch(() => void 0);
					return;
				}
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
				const raw = typeof fn === "function" ? await fn.call(this.remote, sessionId, request, signal) : await this.callRpc(method, sessionId, request, signal);
				signal.throwIfAborted();
				return unwrapWorkflowRemoteResult(raw);
			}
			/** Stock may leave the typed stub unmounted; the Host still serves namespace/method over /api. */
			async callRpc(method, sessionId, request, signal) {
				const rpc = this.connection?.rpc?.call;
				if (typeof rpc !== "function") throw new WorkflowRunsRemoteError("storage-unavailable", `workflow Remote method ${method} is unavailable`);
				return rpc.call(this.connection.rpc, "/api", `workflowRuns/${method}`, { args: {
					agentId: sessionId,
					request
				} }, signal);
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
				savedTitle: "Saved workflows",
				savedEmpty: "No saved workflows yet. Run /create-workflow to author one.",
				emptyRunsHint: "Start one to watch its progress here.",
				start: "Start",
				starting: "Starting…",
				started: (name) => `Started ${name}.`,
				launchFailed: "Unable to start this workflow. Retry.",
				loadingSaved: "Loading saved workflows…",
				noMembersYet: "Agents are spending budget, but no member rows have been published yet. Watch logs while they start.",
				savedCount: (n) => `${n} saved`,
				close: "Close workflows",
				inspect: (n) => `Inspect · ${n} members`,
				pause: "Pause",
				resume: "Resume",
				stop: "Stop",
				save: "Save",
				commandDescription: "Open saved workflows and live runs",
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
				outcomeChild: "Child session",
				childTranscript: "Child transcript",
				childTranscriptBody: "This member finished without a retained return value. Open the child session to inspect its trace.",
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
				savedTitle: "已保存的工作流",
				savedEmpty: "还没有已保存的工作流。使用 /create-workflow 创建一个。",
				emptyRunsHint: "启动后即可在这里查看进度。",
				start: "启动",
				starting: "正在启动…",
				started: (name) => `已启动 ${name}。`,
				launchFailed: "无法启动该工作流。请重试。",
				loadingSaved: "正在载入已保存的工作流…",
				noMembersYet: "代理已开始花费预算，但尚未上报成员行。请先查看日志。",
				savedCount: (n) => `${n} 个已保存`,
				close: "关闭工作流",
				inspect: (n) => `检查 · ${n} 个成员`,
				pause: "暂停",
				resume: "继续",
				stop: "停止",
				save: "保存",
				commandDescription: "打开已保存工作流与实时运行",
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
				outcomeChild: "子会话",
				childTranscript: "子会话记录",
				childTranscriptBody: "该成员没有保留返回值。打开子会话即可查看它的轨迹。",
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
				savedTitle: locale.savedTitle,
				savedEmpty: locale.savedEmpty,
				emptyRunsHint: locale.emptyRunsHint,
				start: locale.start,
				starting: locale.starting,
				started: locale.started,
				launchFailed: locale.launchFailed,
				loadingSaved: locale.loadingSaved,
				noMembersYet: locale.noMembersYet,
				savedCount: locale.savedCount,
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
				},
				outcomeChild: locale.outcomeChild,
				childTranscript: locale.childTranscript,
				childTranscriptBody: locale.childTranscriptBody
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
			else if (outcome.state === "not-produced" && childId !== void 0 && onOpenChild !== void 0) body = (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("h3", { children: labels.childTranscript }), (0, react_jsx_runtime.jsx)("p", {
				className: WorkflowMemberInspector_module_css_default.muted,
				children: labels.childTranscriptBody
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
		const css = ".ENrH5a_dashboard,.ENrH5a_dashboard *{box-sizing:border-box}[data-shell-overlay]:has([data-workflows-dashboard]),#dsh-workflows-overlay:has([data-workflows-dashboard]){z-index:2000;pointer-events:none;background:0 0;position:fixed;inset:0}.ENrH5a_dashboard{z-index:2000;background:color-mix(in srgb, var(--dsw-alias-bg-base) 46%, transparent);width:100%;min-width:0;max-width:100%;color:var(--dsw-alias-label-primary);pointer-events:auto;justify-content:center;align-items:center;padding:clamp(.5rem,2.4vw,2rem);display:flex;position:fixed;inset:0;overflow:hidden}.ENrH5a_frame{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);border-radius:.55rem;flex-direction:column;width:min(76rem,100%);min-width:0;height:min(44rem,100dvh - 1.25rem);min-height:min(22rem,100dvh - 1.25rem);max-height:calc(100dvh - 1.25rem);display:flex;overflow:hidden}.ENrH5a_header{border-bottom:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);flex-wrap:wrap;flex:none;justify-content:space-between;align-items:flex-start;gap:.75rem;min-width:0;padding:.7rem 1rem;display:flex}.ENrH5a_headerCopy{flex:12rem;min-width:0}.ENrH5a_header h1,.ENrH5a_header p,.ENrH5a_executionHeader h2,.ENrH5a_executionHeader p,.ENrH5a_empty h2,.ENrH5a_empty p,.ENrH5a_error p,.ENrH5a_feedback p,.ENrH5a_notice,.ENrH5a_navigatorFooter p,.ENrH5a_inspectorHeading h2,.ENrH5a_groupEmpty,.ENrH5a_retention,.ENrH5a_logLine{margin:0}.ENrH5a_header h1{font-size:1.125rem;line-height:1.2}.ENrH5a_eyebrow{color:var(--dsw-alias-label-tertiary);letter-spacing:.1em;text-transform:uppercase;font-size:.75rem;font-weight:700}.ENrH5a_topSummary,.ENrH5a_muted,.ENrH5a_retention,.ENrH5a_groupEmpty{color:var(--dsw-alias-label-secondary)}.ENrH5a_topSummary{padding-top:.35rem;font-size:.875rem}.ENrH5a_kbdHint{color:var(--dsw-alias-label-tertiary);font-size:.75rem}.ENrH5a_close,.ENrH5a_dashboard button{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);min-width:44px;min-height:44px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;border-radius:.45rem}.ENrH5a_close{flex:none;padding:0 1rem}.ENrH5a_dashboard button:disabled{cursor:wait;opacity:.55}.ENrH5a_notice,.ENrH5a_error,.ENrH5a_feedback{border-bottom:1px solid var(--dsw-alias-border-l3);flex:none;justify-content:space-between;align-items:center;gap:.75rem;padding:.65rem clamp(.875rem,2.5vw,2rem);display:flex}.ENrH5a_notice,.ENrH5a_feedback{color:var(--dsw-alias-label-secondary)}.ENrH5a_error,.ENrH5a_errorText{color:var(--dsw-alias-state-error-primary)}.ENrH5a_error button,.ENrH5a_feedback button{flex:none;padding:0 .85rem}.ENrH5a_empty{text-align:center;flex:1;place-content:center;gap:.55rem;min-width:0;min-height:0;padding:1rem;display:grid}.ENrH5a_layout{background:var(--dsw-alias-border-l3);flex:1;grid-template-columns:minmax(17rem,.82fr) minmax(25rem,1.18fr) minmax(18rem,.9fr);gap:1px;min-width:0;min-height:0;display:grid;overflow:hidden}.ENrH5a_layout[data-inspector=closed]{grid-template-columns:minmax(18rem,.92fr) minmax(0,1.58fr)}.ENrH5a_layout[data-inspector=closed] .ENrH5a_inspector{display:none}.ENrH5a_catalog{flex-direction:column;flex:1;gap:1rem;min-width:0;min-height:0;padding:clamp(1rem,2.4vw,1.75rem);display:flex;overflow:auto}.ENrH5a_catalogHead h2,.ENrH5a_catalogHead p{margin:0}.ENrH5a_catalogHead h2{font-size:1.05rem}.ENrH5a_catalogHead p,.ENrH5a_savedCard p,.ENrH5a_savedRow span{color:var(--dsw-alias-label-secondary)}.ENrH5a_savedGrid{grid-template-columns:repeat(auto-fill,minmax(min(18rem,100%),1fr));gap:.75rem;display:grid}.ENrH5a_savedCard,.ENrH5a_savedRow{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);border-radius:.5rem;justify-content:space-between;align-items:flex-start;gap:.85rem;min-width:0;padding:.9rem 1rem;display:flex}.ENrH5a_savedRow{border:0;border-radius:0;align-items:center;padding:.7rem .8rem}.ENrH5a_savedCard strong,.ENrH5a_savedRow strong{font-size:.95rem;display:block}.ENrH5a_savedCard p{margin:.3rem 0;font-size:.85rem}.ENrH5a_savedRow span{margin-top:.2rem;font-size:.78rem;display:block}.ENrH5a_start{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, var(--dsw-alias-bg-module-platform));min-width:5.25rem;color:var(--dsw-alias-state-business-primary);flex:none;padding:0 .9rem;font-weight:650}.ENrH5a_activity{border:1px dashed var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);border-radius:.45rem;margin:.35rem 0 .75rem;padding:.7rem .8rem}.ENrH5a_navigator,.ENrH5a_detail,.ENrH5a_inspector{overscroll-behavior:contain;background:var(--dsw-alias-bg-base);min-width:0;min-height:0;overflow:hidden auto}.ENrH5a_navigator{flex-direction:column;display:flex}.ENrH5a_runGroup{background:var(--dsw-alias-border-l3);gap:1px;min-width:0;display:grid}.ENrH5a_runGroup h2,.ENrH5a_groupEmpty{background:var(--dsw-alias-bg-base);padding:.65rem .8rem}.ENrH5a_runGroup h2{z-index:1;color:var(--dsw-alias-label-secondary);letter-spacing:.08em;text-transform:uppercase;margin:0;font-size:.75rem;position:sticky;top:0}.ENrH5a_runRow{background:var(--dsw-alias-bg-module-platform);width:100%;min-width:0;height:auto;color:var(--dsw-alias-label-primary);text-align:start;border:0;border-radius:0;gap:.3rem;padding:.8rem;display:grid}.ENrH5a_runRow[data-selected=true]{box-shadow:inset .25rem 0 0 var(--dsw-alias-state-business-primary)}.ENrH5a_runRow[data-status=running] .ENrH5a_runTitle span,.ENrH5a_memberGroup button[data-status=running] span:nth-child(2){color:var(--dsw-alias-state-business-primary)}.ENrH5a_runRow[data-status=running] .ENrH5a_runTitle span:before,.ENrH5a_memberGroup button[data-status=running] span:nth-child(2):before{content:\"\";background:currentColor;border-radius:999px;width:.45rem;height:.45rem;margin-right:.35rem;animation:1.2s ease-in-out infinite ENrH5a_workflowPulse;display:inline-block}.ENrH5a_runRow[data-status=failed] .ENrH5a_runTitle span,.ENrH5a_memberGroup button[data-status=failed] span:nth-child(2){color:var(--dsw-alias-state-error-primary)}.ENrH5a_runRow[data-status=completed] .ENrH5a_runTitle span,.ENrH5a_memberGroup button[data-status=completed] span:nth-child(2){color:var(--dsw-alias-label-secondary)}@keyframes ENrH5a_workflowPulse{50%{opacity:.35}}.ENrH5a_runRow>span{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);font-size:.78rem}.ENrH5a_runTitle{justify-content:space-between;align-items:baseline;gap:.65rem;display:flex}.ENrH5a_runTitle strong{color:var(--dsw-alias-label-primary);font-size:.95rem}.ENrH5a_runTitle span{flex:none}.ENrH5a_navigatorFooter{border-top:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-base);gap:.6rem;margin-top:auto;padding:.8rem;display:grid}.ENrH5a_navigatorFooter>button,.ENrH5a_members>button,.ENrH5a_paneContents>button{width:100%;padding:0 .8rem}.ENrH5a_detail,.ENrH5a_inspector{padding:clamp(.9rem,2.2vw,1.8rem)}.ENrH5a_executionHeader{justify-content:space-between;align-items:flex-start;gap:1rem;min-width:0;display:flex}.ENrH5a_executionHeader>div:first-child{min-width:0}.ENrH5a_executionHeader h2,.ENrH5a_executionHeader p{overflow-wrap:anywhere}.ENrH5a_actions{flex-wrap:wrap;flex:none;justify-content:flex-end;gap:.4rem;display:flex}.ENrH5a_actions button{min-width:4rem;padding:0 .7rem}.ENrH5a_detail>.ENrH5a_error,.ENrH5a_detail>.ENrH5a_feedback,.ENrH5a_members .ENrH5a_error,.ENrH5a_paneContents .ENrH5a_error{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);border-radius:.45rem;margin:.75rem 0;padding:.65rem}.ENrH5a_facts{border-top:1px solid var(--dsw-alias-border-l3);margin:1rem 0;display:grid}.ENrH5a_facts div{border-bottom:1px solid var(--dsw-alias-border-l3);grid-template-columns:minmax(7.5rem,.35fr) minmax(0,1fr);gap:.75rem;min-width:0;padding:.5rem 0;display:grid}.ENrH5a_facts dt{color:var(--dsw-alias-label-tertiary)}.ENrH5a_facts dd{overflow-wrap:anywhere;min-width:0;margin:0}.ENrH5a_phaseRail{grid-template-columns:repeat(auto-fit,minmax(min(11rem,100%),1fr));gap:.5rem;margin:.6rem 0 1rem;padding:0;list-style-position:inside;display:grid}.ENrH5a_phaseRail li{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);overflow-wrap:anywhere;border-radius:.45rem;gap:.25rem;min-width:0;padding:.65rem;display:grid}.ENrH5a_phaseRail span,.ENrH5a_phaseRail small{color:var(--dsw-alias-label-secondary)}.ENrH5a_phaseRail li[data-current=true]{border-color:var(--dsw-alias-state-business-primary)}.ENrH5a_phaseRail li[data-current=true] strong{color:var(--dsw-alias-state-business-primary)}.ENrH5a_tabs{border-bottom:1px solid var(--dsw-alias-border-l3);flex-wrap:wrap;gap:.35rem;margin:1rem 0 .75rem;padding-bottom:.5rem;display:flex}.ENrH5a_tabs button{padding:0 .7rem}.ENrH5a_tabs button[aria-selected=true]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.ENrH5a_members,.ENrH5a_memberGroup,.ENrH5a_paneContents,.ENrH5a_artifactViewer{gap:.55rem;min-width:0;display:grid}.ENrH5a_memberGroup{margin-top:.5rem}.ENrH5a_memberGroup h3,.ENrH5a_artifactViewer h3{color:var(--dsw-alias-label-secondary);margin:0;font-size:.85rem}.ENrH5a_memberGroup button,.ENrH5a_artifactList button{text-align:start;justify-content:space-between;align-items:center;gap:.65rem;width:100%;min-width:0;padding:.45rem .65rem;display:flex}.ENrH5a_memberGroup button span,.ENrH5a_artifactList button span{overflow-wrap:anywhere;min-width:0}.ENrH5a_memberGroup button span:not(:first-child),.ENrH5a_artifactList button span:last-child{color:var(--dsw-alias-label-secondary);flex:none;font-size:.78rem}.ENrH5a_inspectorHeading{border-bottom:1px solid var(--dsw-alias-border-l3);align-items:center;gap:.7rem;margin-bottom:.8rem;padding-bottom:.7rem;display:flex}.ENrH5a_inspectorHeading h2{overflow-wrap:anywhere;min-width:0}.ENrH5a_drilldownBack{flex:none;min-width:44px;min-height:44px;padding:0 .7rem;display:none}.ENrH5a_callout{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);border-radius:.45rem;gap:.35rem;margin:.75rem 0;padding:.65rem;display:grid}.ENrH5a_paneContents pre,.ENrH5a_artifactViewer pre{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-module-platform);max-width:100%;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:.45rem;margin:0;padding:.75rem;overflow:auto}.ENrH5a_logLine{border-bottom:1px solid var(--dsw-alias-border-l3);grid-template-columns:auto minmax(0,1fr);gap:.6rem;padding:.45rem 0;display:grid}.ENrH5a_logLine span{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.ENrH5a_artifactList{gap:.4rem;min-width:0;display:grid}.ENrH5a_artifactList button[aria-pressed=true]{border-color:var(--dsw-alias-state-business-primary)}.ENrH5a_artifactViewer{border-top:1px solid var(--dsw-alias-border-l3);margin-top:.65rem;padding-top:.75rem}.ENrH5a_dashboard button:focus-visible,.ENrH5a_dashboard [tabindex]:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}@media (width<=1199px){.ENrH5a_layout{grid-template-columns:minmax(16rem,.72fr) minmax(0,1.28fr)}.ENrH5a_navigator{grid-column:1}.ENrH5a_detail,.ENrH5a_inspector{grid-area:1/2}.ENrH5a_dashboard:not([data-mobile-view=inspector]) .ENrH5a_inspector,.ENrH5a_dashboard[data-mobile-view=inspector] .ENrH5a_detail{display:none}.ENrH5a_drilldownBack{justify-content:center;align-self:flex-start;align-items:center;min-width:44px;min-height:44px;margin-bottom:.65rem;display:inline-flex}}@media (width<=767px){.ENrH5a_dashboard{align-items:stretch;padding:.5rem}.ENrH5a_frame{width:100%;height:calc(100dvh - 1rem);min-height:0;max-height:calc(100dvh - 1rem)}.ENrH5a_header{padding:.75rem}.ENrH5a_layout{display:block}.ENrH5a_navigator,.ENrH5a_detail,.ENrH5a_inspector{width:100%;height:100%;padding:.75rem;display:none}.ENrH5a_dashboard[data-mobile-view=runs] .ENrH5a_navigator,.ENrH5a_dashboard[data-mobile-view=execution] .ENrH5a_detail,.ENrH5a_dashboard[data-mobile-view=inspector] .ENrH5a_inspector{flex-direction:column;display:flex}.ENrH5a_executionHeader,.ENrH5a_facts div{grid-template-columns:minmax(0,1fr)}.ENrH5a_executionHeader{flex-direction:column}.ENrH5a_actions{justify-content:flex-start;width:100%}.ENrH5a_dashboard button{min-width:44px;min-height:44px}}@media (width<=320px){.ENrH5a_header{gap:.5rem}.ENrH5a_headerCopy,.ENrH5a_kbdHint{flex-basis:100%;min-width:0}.ENrH5a_kbdHint{display:none}.ENrH5a_header h1{font-size:1.05rem}.ENrH5a_close{margin-left:auto;padding:0 .65rem}.ENrH5a_runTitle,.ENrH5a_memberGroup button,.ENrH5a_artifactList button,.ENrH5a_error,.ENrH5a_feedback,.ENrH5a_notice{flex-direction:column;align-items:stretch}.ENrH5a_runTitle span,.ENrH5a_memberGroup button span:not(:first-child),.ENrH5a_artifactList button span:last-child{flex:initial}}@media (prefers-reduced-motion:reduce){.ENrH5a_dashboard,.ENrH5a_dashboard *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}";
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
			"activity": "ENrH5a_activity",
			"artifactList": "ENrH5a_artifactList",
			"artifactViewer": "ENrH5a_artifactViewer",
			"callout": "ENrH5a_callout",
			"catalog": "ENrH5a_catalog",
			"catalogHead": "ENrH5a_catalogHead",
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
			"frame": "ENrH5a_frame",
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
			"savedCard": "ENrH5a_savedCard",
			"savedGrid": "ENrH5a_savedGrid",
			"savedRow": "ENrH5a_savedRow",
			"start": "ENrH5a_start",
			"tabs": "ENrH5a_tabs",
			"topSummary": "ENrH5a_topSummary",
			"workflowPulse": "ENrH5a_workflowPulse"
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
		/** Prefer Remote phases; otherwise recover titles from members or the live phase. */
		function declaredWorkflowPhases(execution, selectedRun, members) {
			if (execution?.phases !== void 0 && execution.phases.length > 0) return execution.phases;
			const seen = /* @__PURE__ */ new Set();
			const fromMembers = [];
			for (const member of members) {
				if (typeof member.phase !== "string" || member.phase === "" || seen.has(member.phase)) continue;
				seen.add(member.phase);
				fromMembers.push({ title: member.phase });
			}
			if (fromMembers.length > 0) return fromMembers;
			const live = execution?.run.phase ?? selectedRun.phase;
			if (typeof live === "string" && live.length > 0) return [{ title: live }];
			return execution?.phases ?? [];
		}
		function memberOutcomeLabel(member, labels) {
			if (member.childSessionId !== void 0 && member.outcome === "not-produced") return labels.outcomeChild;
			return labels.outcome[member.outcome];
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
			const [definitions, setDefinitions] = (0, react.useState)([]);
			const [definitionsPhase, setDefinitionsPhase] = (0, react.useState)("idle");
			const [startingName, setStartingName] = (0, react.useState)();
			const [launchFeedback, setLaunchFeedback] = (0, react.useState)();
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
			(0, react.useEffect)(() => {
				if (!open || sessionId === void 0 || typeof operations.listDefinitions !== "function") {
					if (typeof operations.listDefinitions !== "function") {
						setDefinitions([]);
						setDefinitionsPhase("idle");
					}
					return;
				}
				const abort = new AbortController();
				setDefinitionsPhase("loading");
				operations.listDefinitions(sessionId, abort.signal).then((items) => {
					if (abort.signal.aborted) return;
					setDefinitions(Array.isArray(items) ? items : []);
					setDefinitionsPhase("ready");
				}, (error) => {
					if (abort.signal.aborted || isAbort(error)) return;
					setDefinitions([]);
					setDefinitionsPhase("error");
				});
				return () => {
					abort.abort();
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
			async function startDefinition(name) {
				if (sessionId === void 0 || typeof operations.launchDefinition !== "function" || startingName !== void 0) return;
				setStartingName(name);
				setLaunchFeedback(void 0);
				try {
					await operations.launchDefinition(sessionId, name);
					const snap = await operations.refresh(sessionId);
					setSource(snap);
					const newest = [...snap.runs].filter((run) => run.name === name).sort((left, right) => right.startedAt - left.startedAt)[0];
					if (newest !== void 0) selectRun(newest.runId);
					setLaunchFeedback({
						kind: "notice",
						message: labels.started(name)
					});
				} catch {
					setLaunchFeedback({
						kind: "error",
						message: labels.launchFailed
					});
				} finally {
					setStartingName(void 0);
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
			return (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				className: clsx(WorkflowsDashboard_module_css_default.dashboard),
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": "workflow-dashboard-title",
				tabIndex: -1,
				"data-workflows-dashboard": true,
				"data-mobile-view": mobileView,
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) onCloseRef.current?.();
				},
				children: (0, react_jsx_runtime.jsxs)("div", {
					className: WorkflowsDashboard_module_css_default.frame,
					"data-workflows-frame": true,
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
												definitionsPhase === "ready" || definitions.length > 0 ? `${labels.savedCount(definitions.length)} · ` : "",
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
							message: source.error ?? "Unable to load workflow data. Retry.",
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
						launchFeedback !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: launchFeedback.kind === "error" ? WorkflowsDashboard_module_css_default.error : WorkflowsDashboard_module_css_default.feedback,
							role: launchFeedback.kind === "error" ? "alert" : "status",
							children: (0, react_jsx_runtime.jsx)("p", { children: launchFeedback.message })
						}),
						rows.length === 0 && source.phase !== "loading" && source.phase !== "error" && source.phase !== "reconnecting" ? typeof operations.listDefinitions === "function" ? (0, react_jsx_runtime.jsxs)("main", {
							className: WorkflowsDashboard_module_css_default.catalog,
							"aria-label": labels.savedTitle,
							children: [
								(0, react_jsx_runtime.jsxs)("div", {
									className: WorkflowsDashboard_module_css_default.catalogHead,
									children: [(0, react_jsx_runtime.jsx)("h2", { children: labels.savedTitle }), (0, react_jsx_runtime.jsx)("p", { children: labels.emptyRunsHint })]
								}),
								definitionsPhase === "loading" && (0, react_jsx_runtime.jsx)("p", {
									role: "status",
									children: labels.loadingSaved
								}),
								definitionsPhase === "error" && (0, react_jsx_runtime.jsx)(ErrorRetry, {
									message: "Unable to load workflow data. Retry.",
									onRetry: () => {
										if (sessionId === void 0 || typeof operations.listDefinitions !== "function") return;
										setDefinitionsPhase("loading");
										operations.listDefinitions(sessionId).then((items) => {
											setDefinitions(Array.isArray(items) ? items : []);
											setDefinitionsPhase("ready");
										}, () => {
											setDefinitionsPhase("error");
										});
									}
								}),
								definitionsPhase === "ready" && definitions.length === 0 && (0, react_jsx_runtime.jsx)("p", { children: labels.savedEmpty }),
								definitions.length > 0 && (0, react_jsx_runtime.jsx)("div", {
									className: WorkflowsDashboard_module_css_default.savedGrid,
									children: definitions.map((definition) => (0, react_jsx_runtime.jsx)(SavedCard, {
										definition,
										starting: startingName,
										labels,
										onStart: () => {
											startDefinition(definition.name);
										}
									}, definition.name))
								})
							]
						}) : (0, react_jsx_runtime.jsxs)("main", {
							className: WorkflowsDashboard_module_css_default.empty,
							children: [(0, react_jsx_runtime.jsx)("h2", { children: labels.emptyTitle }), (0, react_jsx_runtime.jsx)("p", { children: labels.emptyBody })]
						}) : rows.length === 0 ? null : (0, react_jsx_runtime.jsxs)("div", {
							className: WorkflowsDashboard_module_css_default.layout,
							"data-inspector": selectedMemberId !== void 0 ? "open" : "closed",
							children: [
								(0, react_jsx_runtime.jsxs)("nav", {
									className: WorkflowsDashboard_module_css_default.navigator,
									"aria-label": "Workflow runs",
									"data-pane": "navigator",
									children: [
										definitions.length > 0 && (0, react_jsx_runtime.jsxs)("section", {
											className: WorkflowsDashboard_module_css_default.runGroup,
											"aria-labelledby": "saved-workflows-heading",
											children: [(0, react_jsx_runtime.jsxs)("h2", {
												id: "saved-workflows-heading",
												children: [
													labels.savedTitle,
													" · ",
													definitions.length
												]
											}), definitions.map((definition) => (0, react_jsx_runtime.jsxs)("div", {
												className: WorkflowsDashboard_module_css_default.savedRow,
												children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: definition.name }), (0, react_jsx_runtime.jsx)("span", { children: definition.description })] }), (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: WorkflowsDashboard_module_css_default.start,
													disabled: startingName !== void 0,
													"aria-label": `${labels.start} ${definition.name}`,
													onClick: () => {
														startDefinition(definition.name);
													},
													children: startingName === definition.name ? labels.starting : labels.start
												})]
											}, definition.name))]
										}),
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
													children: (() => {
														const declared = declaredWorkflowPhases(execution, selectedRun, memberRows);
														const live = execution?.run.phase ?? selectedRun.phase;
														const currentIndex = live === void 0 ? -1 : declared.findIndex((item) => item.title === live);
														return declared.map((phase, index) => {
															const current = live !== void 0 && phase.title === live;
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
														});
													})()
												}),
												declaredWorkflowPhases(execution, selectedRun, memberRows).length === 0 && execution !== void 0 && (0, react_jsx_runtime.jsx)("p", { children: "No declared phases." })
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
															"data-status": member.status,
															"aria-pressed": selectedMemberId === member.memberId,
															onClick: () => selectMember(member.memberId),
															children: [
																(0, react_jsx_runtime.jsx)("span", { children: member.label === "" ? "Unnamed member" : member.label }),
																(0, react_jsx_runtime.jsx)("span", { children: labels.memberStatus[member.status] }),
																(0, react_jsx_runtime.jsx)("span", { children: memberOutcomeLabel(member, labels) })
															]
														}, member.memberId))]
													}, group.key);
												}),
												members.value !== void 0 && memberRows.length === 0 && (0, react_jsx_runtime.jsx)("p", {
													className: WorkflowsDashboard_module_css_default.activity,
													children: selectedRun.budget.spent > 0 ? labels.noMembersYet : "No members started."
												}),
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
				})
			});
		}
		function SavedCard({ definition, starting, labels, onStart }) {
			return (0, react_jsx_runtime.jsxs)("article", {
				className: WorkflowsDashboard_module_css_default.savedCard,
				children: [(0, react_jsx_runtime.jsxs)("div", { children: [
					(0, react_jsx_runtime.jsx)("strong", { children: definition.name }),
					definition.description !== "" && (0, react_jsx_runtime.jsx)("p", { children: definition.description }),
					(0, react_jsx_runtime.jsx)("span", {
						className: WorkflowsDashboard_module_css_default.muted,
						children: [definition.scope, definition.whenToUse].filter(Boolean).join(" · ")
					})
				] }), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: WorkflowsDashboard_module_css_default.start,
					disabled: starting !== void 0,
					"aria-label": `${labels.start} ${definition.name}`,
					onClick: onStart,
					children: starting === definition.name ? labels.starting : labels.start
				})]
			});
		}
		function RunRow({ run, selected, onSelect, labels, now }) {
			const settlement = run.status === "interrupted" && (run.terminal?.error === void 0 || run.terminal.error === "Process exited before workflow settlement.") ? labels.interruptedSettlement : void 0;
			return (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: WorkflowsDashboard_module_css_default.runRow,
				"data-selected": selected ? "true" : "false",
				"data-status": run.status,
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
		function requireCommandUi(commandUi) {
			if (typeof commandUi !== "object" || commandUi === null) throw new Error("workflow dashboard action registration is unavailable");
			const register = commandUi.register;
			const decorate = commandUi.decorate;
			if (typeof register !== "function" || typeof decorate !== "function") throw new Error("workflow dashboard action registration is unavailable");
			return commandUi;
		}
		/** H dispatches kind:action via runAction; stock always openPopup. */
		function commandUiDispatchesActions(commandUi) {
			let current = commandUi;
			while (current !== null) {
				if (typeof current.runAction === "function") return true;
				current = Object.getPrototypeOf(current);
				if (current === Object.prototype) break;
			}
			return false;
		}
		function commandNodeName(record) {
			if (typeof record.name === "string") return record.name;
			const nested = record.data?.name;
			return typeof nested === "string" ? nested : null;
		}
		function conversationCommandNodes(snapshot) {
			const record = snapshot;
			const nodes = Array.isArray(record?.nodes) ? record.nodes : Array.isArray(record?.chat?.legacy?.nodes) ? record.chat.legacy.nodes : [];
			const out = [];
			for (const node of nodes) {
				if (typeof node !== "object" || node === null) continue;
				const item = node;
				if (item.kind !== "command") continue;
				const seq = typeof item.seq === "number" ? item.seq : typeof item.data?.seq === "number" ? item.data.seq : void 0;
				if (seq === void 0) continue;
				out.push({
					seq,
					name: commandNodeName(item)
				});
			}
			return out;
		}
		/** Stock ui-commands emit command/executed; isolate-safe listeners also watch conversation nodes. */
		function listenCommandExecuted(root, onWorkflows) {
			const handler = (_sessionId, name) => {
				if (name === "workflows") onWorkflows();
			};
			const targets = [root];
			const parent = root.root;
			if (typeof parent === "object" && parent !== null && parent !== root) targets.push(parent);
			const disposers = [];
			for (const target of targets) {
				const on = target.on;
				if (typeof on !== "function") continue;
				try {
					const dispose = asDisposer(on.call(target, "command/executed", handler, { global: true }));
					if (dispose !== void 0) disposers.push(dispose);
				} catch {}
			}
			if (disposers.length === 0) return void 0;
			return () => {
				for (const dispose of disposers) dispose();
			};
		}
		function conversationWatchReady(snapshot) {
			const state = snapshot?.openState;
			return state !== "cold" && state !== "loading";
		}
		function watchWorkflowsCommands(sessions, onWorkflows) {
			let stopSession;
			let attachedId;
			let attachedSession;
			const attach = (sessionId) => {
				const id = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : void 0;
				const session = id === void 0 ? void 0 : sessions?.binding?.(id)?.session;
				if (id === attachedId && session === attachedSession && (session === void 0 || stopSession !== void 0)) return;
				stopSession?.();
				stopSession = void 0;
				attachedId = id;
				attachedSession = session;
				if (session === void 0 || typeof session.subscribe !== "function" || typeof session.getSnapshot !== "function") return;
				let primed = false;
				let baseline = 0;
				const ingest = (openNew) => {
					const snapshot = session.getSnapshot();
					if (!conversationWatchReady(snapshot)) return;
					const nodes = conversationCommandNodes(snapshot);
					if (!primed) {
						for (const node of nodes) if (node.seq > baseline) baseline = node.seq;
						primed = true;
						return;
					}
					let sawWorkflows = false;
					let max = baseline;
					for (const node of nodes) {
						if (node.seq <= baseline) continue;
						if (node.seq > max) max = node.seq;
						if (node.name === "workflows") sawWorkflows = true;
					}
					baseline = max;
					if (openNew && sawWorkflows) onWorkflows();
				};
				ingest(false);
				stopSession = asDisposer(session.subscribe(() => {
					ingest(true);
				}));
			};
			attach(sessions?.list?.getSnapshot?.()?.current);
			const stopList = typeof sessions?.list?.subscribe === "function" ? asDisposer(sessions.list.subscribe(() => {
				attach(sessions.list.getSnapshot()?.current);
			})) : void 0;
			const stopProvide = typeof sessions?.currentProvideInfo?.subscribe === "function" ? asDisposer(sessions.currentProvideInfo.subscribe(() => {
				attach(sessions.list?.getSnapshot?.()?.current);
			})) : void 0;
			return () => {
				stopSession?.();
				stopList?.();
				stopProvide?.();
			};
		}
		const PICKER_PAGE_LIMIT = 32;
		const PICKER_TIMEOUT_MS = 2500;
		async function callDefinitionList(list, sessionId, request, signal) {
			try {
				return await list(sessionId, request, signal);
			} catch {
				return await list(sessionId, signal);
			}
		}
		/** Load the picker catalog; an absent or hung Remote must settle, never spin. */
		async function loadPickerDefinitions(remote, session, signal) {
			const list = remote?.workflowDefinitions?.list;
			if (typeof list !== "function") return [];
			const sessionId = String(session?.sessionId ?? "");
			const work = (async () => {
				const items = [];
				const seen = /* @__PURE__ */ new Set();
				let cursor;
				for (let pageNo = 0; pageNo < PICKER_PAGE_LIMIT; pageNo += 1) {
					signal.throwIfAborted();
					const page = unwrapWorkflowRemoteResult(await callDefinitionList(list, sessionId, cursor === void 0 ? { limit: 200 } : {
						limit: 200,
						cursor
					}, signal));
					const pageItems = Array.isArray(page) ? page : Array.isArray(page?.items) ? page.items : [];
					items.push(...pageItems);
					if (items.length > MAX_PICKER_DEFINITIONS) return items.slice(0, MAX_PICKER_DEFINITIONS);
					const next = page?.nextCursor === void 0 || page?.nextCursor === "" ? void 0 : String(page.nextCursor);
					if (next === void 0) return items;
					if (seen.has(next) || next === cursor) return items;
					seen.add(next);
					cursor = next;
				}
				return items;
			})();
			const timeout = new Promise((_, reject) => {
				const timer = setTimeout(() => reject(/* @__PURE__ */ new Error("workflow definition picker timed out")), PICKER_TIMEOUT_MS);
				const abort = () => {
					clearTimeout(timer);
					reject(signal.reason ?? /* @__PURE__ */ new Error("workflow definition picker aborted"));
				};
				if (signal.aborted) abort();
				else signal.addEventListener("abort", abort, { once: true });
				work.finally(() => clearTimeout(timer));
			});
			try {
				return await Promise.race([work, timeout]);
			} catch {
				return [];
			}
		}
		function bindDashboardCatalog(remote, sessions) {
			return {
				async listDefinitions(sessionId, signal) {
					const items = await loadPickerDefinitions(remote, { sessionId }, signal ?? new AbortController().signal);
					const cards = [];
					for (const item of items) {
						const name = typeof item?.name === "string" ? item.name : "";
						if (name === "") continue;
						cards.push({
							name,
							description: typeof item.description === "string" ? item.description : "",
							...typeof item.whenToUse === "string" ? { whenToUse: item.whenToUse } : {},
							...typeof item.scope === "string" ? { scope: item.scope } : {}
						});
					}
					return cards;
				},
				async launchDefinition(sessionId, name, signal) {
					signal?.throwIfAborted();
					if (!/^[a-z](?:[a-z0-9]*)(?:-[a-z0-9]+)*$/u.test(name)) throw new Error("workflow name is invalid");
					const live = sessions.binding?.(sessionId)?.session;
					if (live === void 0 || typeof live.command !== "function") throw new Error("this session is not available");
					const result = await live.command(`/workflow ${name}`);
					if (result?.ok === false) throw new Error(typeof result.error === "string" && result.error.length > 0 ? result.error : "the host rejected /workflow");
					if (result?.value?.matched === false) throw new Error("the host offers no /workflow command");
				}
			};
		}
		/**
		* Register one complete browser aggregate.  The generated Remote is mounted
		* first; every consumer and listener is created in that mount's effect and
		* is disposed before the contribution is unmounted.
		*/
		function apply(ctx) {
			const root = ctx;
			root.effect(async () => {
				const cleanup = [];
				const addCleanup = (value) => {
					if (value !== void 0) cleanup.push(value);
				};
				let dashboardActions;
				let pendingOpen = false;
				let liveAdapter;
				let fallbackRoot;
				let fallbackHost;
				let fallbackOpen = false;
				let remoteDisposer;
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
				const currentSessionId = () => {
					const id = root.sessions?.list?.getSnapshot?.()?.current;
					return typeof id === "string" && id.length > 0 ? id : void 0;
				};
				const renderFallbackDashboard = () => {
					if (typeof document === "undefined" || liveAdapter === void 0) return;
					if (fallbackHost === void 0) {
						fallbackHost = document.createElement("div");
						fallbackHost.id = "dsh-workflows-overlay";
						document.body.appendChild(fallbackHost);
					}
					fallbackRoot ??= (0, react_dom_client.createRoot)(fallbackHost);
					const sessionId = currentSessionId();
					if (fallbackOpen) liveAdapter.observe(sessionId);
					else liveAdapter.observe(void 0);
					fallbackRoot.render(fallbackOpen ? (0, react.createElement)(WorkflowsDashboard, {
						operations: liveAdapter,
						sessionId,
						open: true,
						onClose: () => {
							fallbackOpen = false;
							renderFallbackDashboard();
						},
						labels: dashboardLabelsFromLocale(workflowLocaleFromBind(typeof root.locale?.bind === "function" ? root.locale.bind(NS) : void 0))
					}) : (0, react.createElement)("div"));
				};
				let dispatchesActions = false;
				const openDashboard = () => {
					if (dashboardActions !== void 0 && typeof dashboardActions.open === "function") {
						const active = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
						captureInvoker(active);
						dashboardActions.open();
					}
					if (dispatchesActions && dashboardActions !== void 0 && typeof dashboardActions.open === "function") {
						pendingOpen = false;
						if (typeof document !== "undefined" && liveAdapter !== void 0) queueMicrotask(() => {
							if (document.querySelector("[data-workflows-dashboard]") === null) {
								fallbackOpen = true;
								renderFallbackDashboard();
							}
						});
						return true;
					}
					pendingOpen = true;
					if (liveAdapter === void 0 || typeof document === "undefined") return dashboardActions !== void 0 && typeof dashboardActions.open === "function";
					fallbackOpen = true;
					renderFallbackDashboard();
					pendingOpen = false;
					return fallbackHost !== void 0 || dashboardActions !== void 0 && typeof dashboardActions.open === "function";
				};
				const requestOpen = () => {
					try {
						openDashboard();
					} catch {}
				};
				addCleanup(root.locale?.register?.(NS, workflowLocales));
				const commandUi = requireCommandUi(root.commandUi);
				const translate = typeof root.locale?.bind === "function" ? root.locale.bind(NS) : void 0;
				const workflowsDescription = typeof translate === "function" ? String(translate("commandDescription")) : workflowLocales.en.commandDescription;
				dispatchesActions = commandUiDispatchesActions(commandUi);
				if (dispatchesActions) addCleanup(asDisposer(commandUi.register({
					name: "workflows",
					description: workflowsDescription,
					available: () => true,
					ui: {
						kind: "action",
						run: () => {
							if (!openDashboard()) throw new Error("workflow dashboard overlay is not mounted");
						}
					}
				})));
				addCleanup(listenCommandExecuted(root, requestOpen));
				let controller;
				let adapter;
				try {
					const remote = root.remote;
					const sessions = root.sessions;
					const liveController = new WorkflowRunsController(remote, sessions, root.connection);
					const adapterInstance = new DashboardWorkflowRunsAdapter(liveController);
					const catalog = bindDashboardCatalog(remote, sessions);
					adapterInstance.listDefinitions = catalog.listDefinitions;
					adapterInstance.launchDefinition = catalog.launchDefinition;
					liveAdapter = adapterInstance;
					controller = liveController;
					adapter = adapterInstance;
					addCleanup(watchWorkflowsCommands(sessions, requestOpen));
					if (pendingOpen) openDashboard();
					root.workflowRunsController = liveController;
					root.workflowRunsAdapter = liveAdapter;
					root.workflowRunDefinition = workflowRunDefinition;
					addCleanup(root.conversationEvents?.register?.(workflowMessageDefinition$1));
					if (root.conversationEvents !== void 0 && root.conversationEvents.register !== void 0 && workflowMessageDefinition$1 !== workflowRunDefinition) addCleanup(root.conversationEvents.register(workflowRunDefinition));
					const runChatComponent = (props) => {
						const dict = workflowLocaleFromBind(typeof root.locale?.bind === "function" ? root.locale.bind(NS) : void 0);
						return (0, react.createElement)(WorkflowRunChatSlot, {
							...props,
							operations: adapterInstance,
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
							operations: adapterInstance,
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
						const source = (0, react.useSyncExternalStore)(adapterInstance.source.subscribe, adapterInstance.source.getSnapshot, adapterInstance.source.getSnapshot);
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
							operations: adapterInstance,
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
							if (actions !== void 0 && typeof actions.open === "function") {
								dashboardActions = actions;
								if (pendingOpen) {
									pendingOpen = false;
									actions.open();
								}
							}
							return {
								operations: adapterInstance,
								hooks: { workflowRuns: adapterInstance.source }
							};
						}
					}, DashboardContribution));
					addCleanup(overlayInjection);
					function WorkflowsCommandRow(props) {
						const node = props?.node;
						const text = typeof node?.outcome?.text === "string" && node.outcome.text.length > 0 ? node.outcome.text : workflowsDescription;
						return (0, react.createElement)("div", { "data-workflows-command-row": "" }, (0, react.createElement)("span", null, "workflows"), (0, react.createElement)("span", null, text), (0, react.createElement)("button", {
							type: "button",
							onClick: () => {
								requestOpen();
							}
						}, workflowLocales.en.title));
					}
					addCleanup(asDisposer(root.slots?.inject?.("conversation.chat.commandview", () => root.slots.register({
						name: "conversation.chat.commandview",
						key: "workflows",
						locale: NS
					}, WorkflowsCommandRow))));
					if (typeof remote?.$mount === "function") try {
						remoteDisposer = await remote.$mount(TYPERT_REMOTE);
					} catch {
						remoteDisposer = void 0;
					}
					liveAdapter.observe(currentSessionId());
					if (pendingOpen) openDashboard();
					if (typeof remote?.workflowDefinitions?.list === "function") addCleanup(asDisposer(commandUi.decorate({
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
					if (typeof remoteOn === "function") addCleanup(remoteOn.call(remote, "workflows/run-change", (change) => liveController.handleChange(change)));
					const hostDescription = root.connection?.hostDescription;
					if (hostDescription?.subscribe !== void 0) {
						addCleanup(hostDescription.subscribe(() => {
							if (hostDescription.getSnapshot?.() === void 0) liveController.handleDisconnected();
							else liveController.handleConnected();
						}));
						if (hostDescription.getSnapshot?.() === void 0) liveController.handleDisconnected();
					}
					if (typeof root.on === "function") {
						const registered = root.on("connection/reset", () => liveController.handleReset());
						if (typeof registered === "function") addCleanup(registered);
					}
					if (sessions.list?.subscribe !== void 0) {
						let previous = new Set(sessionListIds(sessions) ?? []);
						addCleanup(sessions.list.subscribe(() => {
							const current = sessionListIds(sessions);
							if (current === void 0) return;
							const keys = new Set(current);
							for (const id of previous) if (!keys.has(id)) liveController.removeSession(id);
							previous = keys;
						}));
					}
				} catch {}
				return async () => {
					dashboardActions = void 0;
					overlayListeners.clear();
					fallbackOpen = false;
					try {
						fallbackRoot?.unmount();
					} catch {}
					fallbackRoot = void 0;
					fallbackHost?.remove();
					fallbackHost = void 0;
					for (const dispose of cleanup.reverse()) try {
						await dispose();
					} catch {}
					adapter?.dispose();
					controller?.dispose();
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
		exports.declaredWorkflowPhases = declaredWorkflowPhases;
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