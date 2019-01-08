"use strict";

class LoaderRunnerError extends Error {
	constructor(message, code) {
		super(message);
		this.name = "LoaderRunnerError";
		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = LoaderRunnerError;
