"use strict";

const LoaderLoadingError = require("./LoaderLoadingError");

let url;

// Feature-detected: when the runtime lacks these builtins (Node < 14.6) the
// cache is silently disabled and loadLoader behaves as before. The engines
// range stays at >=6.11.5.
/* eslint-disable n/no-unsupported-features/es-builtins, n/no-unsupported-features/es-syntax */
const WeakRefCtor = typeof WeakRef === "function" ? WeakRef : null;
const FinalizationRegistryCtor =
	typeof FinalizationRegistry === "function" ? FinalizationRegistry : null;
/* eslint-enable n/no-unsupported-features/es-builtins, n/no-unsupported-features/es-syntax */
const hasWeakCache = WeakRefCtor !== null && FinalizationRegistryCtor !== null;

// Resolved values are held via WeakRef so the cache never prevents GC of an
// unreferenced module. The FinalizationRegistry scrubs stale entries.
const resolvedCache = hasWeakCache ? new Map() : null;
// In-flight ESM imports are held strongly so concurrent loads share one promise.
const pendingCache = hasWeakCache ? new Map() : null;
const finalizer = hasWeakCache
	? new FinalizationRegistryCtor((path) => {
			resolvedCache.delete(path);
		})
	: null;

function cacheGet(path) {
	if (!resolvedCache) return undefined;
	const ref = resolvedCache.get(path);
	if (ref === undefined) return undefined;
	const value = ref.deref();
	if (value === undefined) {
		resolvedCache.delete(path);
		return undefined;
	}
	return value;
}

function cacheSet(path, value) {
	if (!resolvedCache) return;
	if (value === null) return;
	if (typeof value !== "object" && typeof value !== "function") return;
	resolvedCache.set(path, new WeakRefCtor(value));
	finalizer.register(value, path);
}

function handleResult(loader, module, callback) {
	if (typeof module !== "function" && typeof module !== "object") {
		return callback(
			new LoaderLoadingError(
				`Module '${loader.path}' is not a loader (export function or es6 module)`
			)
		);
	}

	loader.normal = typeof module === "function" ? module : module.default;
	loader.pitch = module.pitch;
	loader.raw = module.raw;

	if (
		typeof loader.normal !== "function" &&
		typeof loader.pitch !== "function"
	) {
		return callback(
			new LoaderLoadingError(
				`Module '${loader.path}' is not a loader (must have normal or pitch function)`
			)
		);
	}
	callback();
}

function loadLoader(loader, callback) {
	if (loader.type === "module") {
		const cached = cacheGet(loader.path);
		if (cached !== undefined) {
			return handleResult(loader, cached, callback);
		}

		try {
			if (url === undefined) url = require("url");

			let modulePromise = pendingCache && pendingCache.get(loader.path);
			if (!modulePromise) {
				// eslint-disable-next-line n/no-unsupported-features/node-builtins
				const loaderUrl = url.pathToFileURL(loader.path);
				// Use `eval` so older parsers (and the main module resolver) don't
				// need to recognize the dynamic `import()` syntax at load time.
				// eslint-disable-next-line no-eval
				modulePromise = eval(`import(${JSON.stringify(loaderUrl.toString())})`);
				if (pendingCache) {
					pendingCache.set(loader.path, modulePromise);
					const clear = () => pendingCache.delete(loader.path);
					modulePromise.then(
						(m) => {
							cacheSet(loader.path, m);
							clear();
						},
						() => clear()
					);
				}
			}

			modulePromise.then((module) => {
				handleResult(loader, module, callback);
			}, callback);
		} catch (err) {
			callback(err);
		}
		return;
	}

	const cached = cacheGet(loader.path);
	if (cached !== undefined) {
		return handleResult(loader, cached, callback);
	}

	let loadedModule;
	try {
		loadedModule = require(loader.path);
	} catch (err) {
		// It is possible for node to choke on a require if the FD descriptor
		// limit has been reached. Give it a chance to recover by deferring.
		if (err instanceof Error && err.code === "EMFILE") {
			return setImmediate(loadLoader, loader, callback);
		}
		return callback(err);
	}

	cacheSet(loader.path, loadedModule);
	return handleResult(loader, loadedModule, callback);
}

module.exports = loadLoader;
