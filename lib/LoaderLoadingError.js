"use strict";

class LoadingLoaderError extends Error {
	constructor(message) {
		super(message);
		this.name = "LoaderRunnerError";
	}
}

module.exports = LoadingLoaderError;
