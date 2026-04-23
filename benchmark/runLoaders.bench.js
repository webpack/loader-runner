"use strict";

// Real-world-ish runLoaders benchmark.
// Simulates the actual loader-runner usage pattern: many source files, each
// processed through a fixed set of loaders - the same call pattern webpack
// drives. Swaps the loadLoader implementation at module-cache level so we can
// compare "no cache" (pre-weak-cache behavior) vs "weak cache" (current lib)
// without maintaining two branches.

const path = require("path");
const fs = require("fs");
const os = require("os");
const { performance } = require("perf_hooks");

const LOADER_RUNNER_PATH = require.resolve("../lib/LoaderRunner");
const LOAD_LOADER_PATH = require.resolve("../lib/loadLoader");
const LOADER_LOADING_ERROR_PATH = require.resolve("../lib/LoaderLoadingError");

const LOADERS = [
	path.resolve(__dirname, "../test/fixtures/simple-loader.js"),
	path.resolve(__dirname, "../test/fixtures/identity-loader.js"),
	path.resolve(__dirname, "../test/fixtures/raw-loader.js"),
];

function makeResources(count) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "loader-bench-"));
	const files = [];
	for (let i = 0; i < count; i++) {
		const p = path.join(dir, `file-${i}.txt`);
		fs.writeFileSync(p, `contents of file ${i}\n`.repeat(20));
		files.push(p);
	}
	return { dir, files };
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

function makeNoCacheLoadLoader() {
	const LoaderLoadingError = require(LOADER_LOADING_ERROR_PATH);
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

function installImpl(loadLoaderFn) {
	// Freshly inject a stub exports object for ../lib/loadLoader so that when
	// LoaderRunner is re-required, it picks up our chosen implementation.
	delete require.cache[LOADER_RUNNER_PATH];
	delete require.cache[LOAD_LOADER_PATH];
	require.cache[LOAD_LOADER_PATH] = {
		id: LOAD_LOADER_PATH,
		filename: LOAD_LOADER_PATH,
		loaded: true,
		exports: loadLoaderFn,
		children: [],
		paths: [],
	};
	return require(LOADER_RUNNER_PATH).runLoaders;
}

function buildOnce(runLoaders, resource) {
	return new Promise((resolve, reject) => {
		runLoaders(
			{
				resource,
				loaders: LOADERS,
				context: {},
				readResource: fs.readFile,
			},
			(err, result) => {
				if (err) return reject(err);
				resolve(result);
			}
		);
	});
}

function buildAll(runLoaders, files) {
	// Run in parallel-ish batches of 32 to mimic webpack's concurrency without
	// melting the FD table.
	return new Promise((resolve, reject) => {
		let idx = 0;
		let inFlight = 0;
		let done = 0;
		const total = files.length;
		const BATCH = 32;
		let rejected = false;
		const kick = () => {
			if (rejected) return;
			while (inFlight < BATCH && idx < total) {
				const file = files[idx++];
				inFlight++;
				buildOnce(runLoaders, file)
					.then(() => {
						inFlight--;
						done++;
						if (done === total) return resolve();
						kick();
					})
					.catch((err) => {
						if (rejected) return;
						rejected = true;
						reject(err);
					});
			}
		};
		kick();
	});
}

function bench(label, runLoaders, files, runs) {
	// warmup
	return buildAll(runLoaders, files.slice(0, 50)).then(() => {
		const times = [];
		const one = () => {
			const start = performance.now();
			return buildAll(runLoaders, files).then(() => {
				times.push(performance.now() - start);
			});
		};
		let p = Promise.resolve();
		for (let r = 0; r < runs; r++) p = p.then(one);
		return p.then(() => {
			times.sort((a, b) => a - b);
			const best = times[0];
			const median = times[Math.floor(times.length / 2)];
			const throughput = Math.round((files.length / median) * 1000);
			console.log(
				`${label.padEnd(14)} best=${best.toFixed(0).padStart(5)}ms  median=${median.toFixed(0).padStart(5)}ms  ${throughput.toLocaleString()} files/s`
			);
			return median;
		});
	});
}

function main() {
	const N_FILES = 2000;
	const N_RUNS = 5;
	const { dir, files } = makeResources(N_FILES);
	console.log(
		`node ${process.version} - ${N_FILES} files x ${LOADERS.length} loaders, ${N_RUNS} runs`
	);

	// Stash the real module-exports of loadLoader so we can restore later.
	const realEntry = require.cache[LOAD_LOADER_PATH];

	const cachedRun = installImpl(require(LOAD_LOADER_PATH));
	return bench("weak-cache", cachedRun, files, N_RUNS)
		.then((cachedMedian) => {
			const uncachedRun = installImpl(makeNoCacheLoadLoader());
			return bench("no-cache", uncachedRun, files, N_RUNS).then(
				(uncachedMedian) => {
					const delta = uncachedMedian - cachedMedian;
					const pct = (delta / uncachedMedian) * 100;
					console.log(
						`delta: ${delta.toFixed(0)}ms (${pct.toFixed(1)}% faster with cache)`
					);
				}
			);
		})
		.then(() => {
			if (realEntry) require.cache[LOAD_LOADER_PATH] = realEntry;
			cleanup(dir);
		})
		.catch((err) => {
			cleanup(dir);
			throw err;
		});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
