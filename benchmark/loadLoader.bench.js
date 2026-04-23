"use strict";

// Benchmarks loadLoader throughput on a repeated same-path workload, which is
// the workload PR #71 aimed at. Runs three configurations:
//   1. current  - the weak-cached loadLoader from lib/
//   2. no-cache - a baseline copy with caching stripped out
//   3. strong   - a baseline copy that caches in a plain object (PR #71 shape)
//
// Each configuration is run for both CommonJS and ESM loaders.

const path = require("path");
const { performance } = require("perf_hooks");

const LoaderLoadingError = require("../lib/LoaderLoadingError");
const cachedLoadLoader = require("../lib/loadLoader");

const CJS_PATH = path.resolve(__dirname, "../test/fixtures/simple-loader.js");
const ESM_PATH = path.resolve(__dirname, "../test/fixtures/esm-loader.mjs");

function makeNoCacheLoadLoader() {
	let url;
	function handleResult(loader, module, callback) {
		if (typeof module !== "function" && typeof module !== "object") {
			return callback(new LoaderLoadingError("not a loader"));
		}
		loader.normal = typeof module === "function" ? module : module.default;
		loader.pitch = module.pitch;
		loader.raw = module.raw;
		if (
			typeof loader.normal !== "function" &&
			typeof loader.pitch !== "function"
		) {
			return callback(new LoaderLoadingError("not a loader"));
		}
		callback();
	}
	return function loadLoader(loader, callback) {
		if (loader.type === "module") {
			try {
				if (url === undefined) url = require("url");
				const loaderUrl = url.pathToFileURL(loader.path);
				// eslint-disable-next-line no-eval
				const p = eval(`import(${JSON.stringify(loaderUrl.toString())})`);
				p.then((m) => handleResult(loader, m, callback), callback);
			} catch (err) {
				callback(err);
			}
			return;
		}
		let m;
		try {
			m = require(loader.path);
		} catch (err) {
			return callback(err);
		}
		return handleResult(loader, m, callback);
	};
}

function makeStrongCacheLoadLoader() {
	let url;
	const cache = Object.create(null);
	function handleResult(loader, module, callback) {
		if (typeof module !== "function" && typeof module !== "object") {
			return callback(new LoaderLoadingError("not a loader"));
		}
		loader.normal = typeof module === "function" ? module : module.default;
		loader.pitch = module.pitch;
		loader.raw = module.raw;
		if (
			typeof loader.normal !== "function" &&
			typeof loader.pitch !== "function"
		) {
			return callback(new LoaderLoadingError("not a loader"));
		}
		callback();
	}
	return function loadLoader(loader, callback) {
		if (loader.type === "module") {
			const cached = cache[loader.path];
			if (cached !== undefined) return handleResult(loader, cached, callback);
			try {
				if (url === undefined) url = require("url");
				const loaderUrl = url.pathToFileURL(loader.path);
				// eslint-disable-next-line no-eval
				const p = eval(`import(${JSON.stringify(loaderUrl.toString())})`);
				p.then((m) => {
					cache[loader.path] = m;
					handleResult(loader, m, callback);
				}, callback);
			} catch (err) {
				callback(err);
			}
			return;
		}
		let m = cache[loader.path];
		if (m === undefined) {
			try {
				m = require(loader.path);
			} catch (err) {
				return callback(err);
			}
			cache[loader.path] = m;
		}
		return handleResult(loader, m, callback);
	};
}

// Drives iterations without recursing through sync callbacks (CJS paths
// invoke callback synchronously, which would blow the stack at this scale).
function runCjs(loadLoader, iterations) {
	return new Promise((resolve, reject) => {
		let i = 0;
		let syncDone;
		const cb = (err) => {
			if (err) return reject(err);
			syncDone = true;
		};
		while (i < iterations) {
			syncDone = false;
			const loader = { path: CJS_PATH };
			loadLoader(loader, cb);
			if (!syncDone) return reject(new Error("unexpected async CJS"));
			i++;
		}
		resolve();
	});
}

function runEsm(loadLoader, iterations) {
	return new Promise((resolve, reject) => {
		let i = 0;
		const step = () => {
			if (i >= iterations) return resolve();
			const loader = { path: ESM_PATH, type: "module" };
			loadLoader(loader, (err) => {
				if (err) return reject(err);
				i++;
				// defer to avoid building up a promise chain so deep it overflows
				setImmediate(step);
			});
		};
		step();
	});
}

function bench(label, fn, iterations) {
	// warmup, then 5 timed runs, report best + median
	return fn(iterations / 10).then(() => {
		const runs = [];
		const one = () => {
			const start = performance.now();
			return fn(iterations).then(() => {
				runs.push(performance.now() - start);
			});
		};
		let p = Promise.resolve();
		for (let r = 0; r < 5; r++) p = p.then(one);
		return p.then(() => {
			runs.sort((a, b) => a - b);
			const median = runs[Math.floor(runs.length / 2)];
			const best = runs[0];
			const opsPerSec = Math.round((iterations / median) * 1000);
			console.log(
				`${label.padEnd(28)} best=${best.toFixed(2)}ms  median=${median.toFixed(2)}ms  ops/s=${opsPerSec.toLocaleString()}`
			);
		});
	});
}

function main() {
	const noCache = makeNoCacheLoadLoader();
	const strong = makeStrongCacheLoadLoader();
	const CJS_ITERS = 500000;
	const ESM_ITERS = 20000;

	console.log(`node ${process.version}`);
	console.log(`--- CommonJS loader (${CJS_ITERS} iters) ---`);
	return bench("cjs no-cache", (n) => runCjs(noCache, n), CJS_ITERS)
		.then(() => bench("cjs strong-cache", (n) => runCjs(strong, n), CJS_ITERS))
		.then(() =>
			bench("cjs weak-cache", (n) => runCjs(cachedLoadLoader, n), CJS_ITERS)
		)
		.then(() => {
			console.log(`--- ESM loader (${ESM_ITERS} iters) ---`);
		})
		.then(() => bench("esm no-cache", (n) => runEsm(noCache, n), ESM_ITERS))
		.then(() => bench("esm strong-cache", (n) => runEsm(strong, n), ESM_ITERS))
		.then(() =>
			bench("esm weak-cache", (n) => runEsm(cachedLoadLoader, n), ESM_ITERS)
		);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
