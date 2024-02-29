var LoaderLoadingError = require("./LoaderLoadingError");

module.exports = function loadLoader(loader, resolveLoader, callback) {
	resolveLoader(loader.path, (err, loaderPath) => {
		if(err) {
			return callback(err);
		}
		if(loader.type === "module") {
			loadModule(loaderPath, loader, callback);
		} else {
			load(loaderPath, loader, callback);
		}
	});
};

var url;
function loadModule(loaderPath, loader, callback) {
	try {
		if(url === undefined) url = require("url");
		var loaderUrl = url.pathToFileURL(loaderPath);
		var modulePromise = eval("import(" + JSON.stringify(loaderUrl.toString()) + ")");
		modulePromise.then(function(module) {
			handleResult(loader, module, callback);
		}, callback);
		return;
	} catch(e) {
		callback(e);
	}
}

function load(loaderPath, loader, callback) {
	try {
		var module = require(loaderPath);
	} catch(e) {
		// it is possible for node to choke on a require if the FD descriptor
		// limit has been reached. give it a chance to recover.
		if(e instanceof Error && e.code === "EMFILE") {
			var retry = load.bind(null, loaderPath, loader, callback);
			if(typeof setImmediate === "function") {
				// node >= 0.9.0
				return setImmediate(retry);
			} else {
				// node < 0.9.0
				return process.nextTick(retry);
			}
		}
		return callback(e);
	}
	handleResult(loader, module, callback);
}

function handleResult(loader, module, callback) {
	if(typeof module !== "function" && typeof module !== "object") {
		return callback(new LoaderLoadingError(
			"Module '" + loader.path + "' is not a loader (export function or es6 module)"
		));
	}
	loader.normal = typeof module === "function" ? module : module.default;
	loader.pitch = module.pitch;
	loader.raw = module.raw;
	if(typeof loader.normal !== "function" && typeof loader.pitch !== "function") {
		return callback(new LoaderLoadingError(
			"Module '" + loader.path + "' is not a loader (must have normal or pitch function)"
		));
	}
	callback();
}
