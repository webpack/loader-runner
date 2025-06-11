/* globals describe it */

"use strict";

require("should");

const path = require("path");
const fs = require("fs");
const { runLoaders } = require("../");
const { getContext } = require("../");

const fixtures = path.resolve(__dirname, "fixtures");

describe("runLoaders", () => {
	it("should process only a resource", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql([Buffer.from("resource", "utf8")]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should process a simple sync loader", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "simple-loader.js")],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["resource-simple"]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should process a simple async loader", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "simple-async-loader.js")],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["resource-async-simple"]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should process a simple promise loader", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "simple-promise-loader.js")],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["resource-promise-simple"]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should process multiple simple loaders", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [
					path.resolve(fixtures, "simple-async-loader.js"),
					path.resolve(fixtures, "simple-loader.js"),
					path.resolve(fixtures, "simple-async-loader.js"),
					path.resolve(fixtures, "simple-async-loader.js"),
					path.resolve(fixtures, "simple-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql([
					"resource-simple-async-simple-async-simple-simple-async-simple",
				]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should process pitching loaders", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [
					path.resolve(fixtures, "simple-loader.js"),
					path.resolve(fixtures, "pitching-loader.js"),
					path.resolve(fixtures, "simple-async-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql([
					`${path.resolve(fixtures, "simple-async-loader.js")}!${path.resolve(
						fixtures,
						"resource.bin"
					)}:${path.resolve(fixtures, "simple-loader.js")}-simple`,
				]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should interpret explicit `undefined` values from async 'pitch' loaders", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [
					path.resolve(fixtures, "simple-loader.js"),
					path.resolve(fixtures, "pitch-async-undef-loader.js"),
					path.resolve(fixtures, "pitch-promise-undef-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["resource-simple"]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should interrupt pitching when async loader completes with any additional non-undefined values", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [
					path.resolve(fixtures, "simple-loader.js"),
					path.resolve(fixtures, "pitch-async-undef-some-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["undefined-simple"]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should be possible to add dependencies", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "dependencies-loader.js")],
			},
			(err, result) => {
				if (err) return done(err);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql(["a", "b"]);
				result.contextDependencies.should.be.eql(["c"]);
				result.missingDependencies.should.be.eql(["d"]);
				result.result.should.be.eql([
					`resource\n${JSON.stringify(["a", "b"])}${JSON.stringify([
						"c",
					])}${JSON.stringify(["d"])}`,
				]);
				done();
			}
		);
	});
	it("should have to correct keys in context", (done) => {
		runLoaders(
			{
				resource: `${path.resolve(fixtures, "resource.bin")}?query#frag`,
				loaders: [
					`${path.resolve(fixtures, "keys-loader.js")}?loader-query`,
					path.resolve(fixtures, "simple-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				try {
					JSON.parse(result.result[0]).should.be.eql({
						context: fixtures,
						resource: `${path.resolve(fixtures, "resource.bin")}?query#frag`,
						resourcePath: path.resolve(fixtures, "resource.bin"),
						resourceQuery: "?query",
						resourceFragment: "#frag",
						loaderIndex: 0,
						query: "?loader-query",
						currentRequest: `${path.resolve(
							fixtures,
							"keys-loader.js"
						)}?loader-query!${path.resolve(
							fixtures,
							"simple-loader.js"
						)}!${path.resolve(fixtures, "resource.bin")}?query#frag`,
						remainingRequest: `${path.resolve(
							fixtures,
							"simple-loader.js"
						)}!${path.resolve(fixtures, "resource.bin")}?query#frag`,
						previousRequest: "",
						request: `${path.resolve(
							fixtures,
							"keys-loader.js"
						)}?loader-query!${path.resolve(
							fixtures,
							"simple-loader.js"
						)}!${path.resolve(fixtures, "resource.bin")}?query#frag`,
						data: null,
						loaders: [
							{
								request: `${path.resolve(fixtures, "keys-loader.js")}?loader-query`,
								path: path.resolve(fixtures, "keys-loader.js"),
								query: "?loader-query",
								fragment: "",
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
							{
								request: path.resolve(fixtures, "simple-loader.js"),
								path: path.resolve(fixtures, "simple-loader.js"),
								query: "",
								fragment: "",
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
						],
					});
				} catch (err_) {
					return done(err_);
				}
				done();
			}
		);
	});
	it("should have to correct keys in context (with options)", (done) => {
		runLoaders(
			{
				resource: `${path.resolve(fixtures, "resource.bin")}?query`,
				loaders: [
					{
						loader: path.resolve(fixtures, "keys-loader.js"),
						options: {
							ident: "ident",
							loader: "query",
						},
					},
				],
			},
			(err, result) => {
				if (err) return done(err);
				try {
					JSON.parse(result.result[0]).should.be.eql({
						context: fixtures,
						resource: `${path.resolve(fixtures, "resource.bin")}?query`,
						resourcePath: path.resolve(fixtures, "resource.bin"),
						resourceQuery: "?query",
						resourceFragment: "",
						loaderIndex: 0,
						query: {
							ident: "ident",
							loader: "query",
						},
						currentRequest: `${path.resolve(
							fixtures,
							"keys-loader.js"
						)}??ident!${path.resolve(fixtures, "resource.bin")}?query`,
						remainingRequest: `${path.resolve(fixtures, "resource.bin")}?query`,
						previousRequest: "",
						request: `${path.resolve(
							fixtures,
							"keys-loader.js"
						)}??ident!${path.resolve(fixtures, "resource.bin")}?query`,
						data: null,
						loaders: [
							{
								request: `${path.resolve(fixtures, "keys-loader.js")}??ident`,
								path: path.resolve(fixtures, "keys-loader.js"),
								query: "??ident",
								fragment: "",
								options: {
									ident: "ident",
									loader: "query",
								},
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
						],
					});
				} catch (err_) {
					return done(err_);
				}
				done();
			}
		);
	});
	it("should process raw loaders", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "bom.bin"),
				loaders: [path.resolve(fixtures, "raw-loader.js")],
			},
			(err, result) => {
				if (err) return done(err);
				result.result[0].toString("utf8").should.be.eql("efbbbf62c3b66d﻿böm");
				done();
			}
		);
	});
	it("should process omit BOM on string conversion", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "bom.bin"),
				loaders: [
					path.resolve(fixtures, "raw-loader.js"),
					path.resolve(fixtures, "simple-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result[0]
					.toString("utf8")
					.should.be.eql("62c3b66d2d73696d706c65böm-simple");
				done();
			}
		);
	});
	it("should have to correct keys in context without resource", (done) => {
		runLoaders(
			{
				loaders: [
					path.resolve(fixtures, "identity-loader.js"),
					path.resolve(fixtures, "keys-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				try {
					JSON.parse(result.result[0]).should.be.eql({
						context: null,
						loaderIndex: 1,
						query: "",
						currentRequest: `${path.resolve(fixtures, "keys-loader.js")}!`,
						remainingRequest: "",
						previousRequest: path.resolve(fixtures, "identity-loader.js"),
						request: `${path.resolve(
							fixtures,
							"identity-loader.js"
						)}!${path.resolve(fixtures, "keys-loader.js")}!`,
						data: null,
						loaders: [
							{
								request: path.resolve(fixtures, "identity-loader.js"),
								path: path.resolve(fixtures, "identity-loader.js"),
								query: "",
								fragment: "",
								data: {
									identity: true,
								},
								pitchExecuted: true,
								normalExecuted: false,
							},
							{
								request: path.resolve(fixtures, "keys-loader.js"),
								path: path.resolve(fixtures, "keys-loader.js"),
								query: "",
								fragment: "",
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
						],
					});
				} catch (err_) {
					return done(err_);
				}
				done();
			}
		);
	});
	it("should have to correct keys in context with only resource query", (done) => {
		runLoaders(
			{
				resource: "?query",
				loaders: [
					{
						loader: path.resolve(fixtures, "keys-loader.js"),
						options: {
							ok: true,
						},
						ident: "my-ident",
					},
				],
			},
			(err, result) => {
				if (err) return done(err);
				try {
					JSON.parse(result.result[0]).should.be.eql({
						context: null,
						resource: "?query",
						resourcePath: "",
						resourceQuery: "?query",
						resourceFragment: "",
						loaderIndex: 0,
						query: {
							ok: true,
						},
						currentRequest: `${path.resolve(fixtures, "keys-loader.js")}??my-ident!?query`,
						remainingRequest: "?query",
						previousRequest: "",
						request:
							`${path.resolve(fixtures, "keys-loader.js")}??my-ident!` +
							"?query",
						data: null,
						loaders: [
							{
								request: `${path.resolve(fixtures, "keys-loader.js")}??my-ident`,
								path: path.resolve(fixtures, "keys-loader.js"),
								query: "??my-ident",
								fragment: "",
								ident: "my-ident",
								options: {
									ok: true,
								},
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
						],
					});
				} catch (err_) {
					return done(err_);
				}
				done();
			}
		);
	});
	it("should have to correct keys in context with only resource fragment", (done) => {
		runLoaders(
			{
				resource: "#fragment",
				loaders: [
					{
						loader: path.resolve(fixtures, "keys-loader.js"),
						options: {
							ok: true,
						},
						ident: "my-ident",
					},
				],
			},
			(err, result) => {
				if (err) return done(err);
				try {
					JSON.parse(result.result[0]).should.be.eql({
						context: null,
						resource: "#fragment",
						resourcePath: "",
						resourceQuery: "",
						resourceFragment: "#fragment",
						loaderIndex: 0,
						query: {
							ok: true,
						},
						currentRequest: `${path.resolve(fixtures, "keys-loader.js")}??my-ident!#fragment`,
						remainingRequest: "#fragment",
						previousRequest: "",
						request:
							`${path.resolve(fixtures, "keys-loader.js")}??my-ident!` +
							"#fragment",
						data: null,
						loaders: [
							{
								request: `${path.resolve(fixtures, "keys-loader.js")}??my-ident`,
								path: path.resolve(fixtures, "keys-loader.js"),
								query: "??my-ident",
								fragment: "",
								ident: "my-ident",
								options: {
									ok: true,
								},
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
						],
					});
				} catch (err_) {
					return done(err_);
				}
				done();
			}
		);
	});
	it("should allow to change loader order and execution", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "bom.bin"),
				loaders: [
					path.resolve(fixtures, "change-stuff-loader.js"),
					path.resolve(fixtures, "simple-loader.js"),
					path.resolve(fixtures, "simple-loader.js"),
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["resource"]);
				done();
			}
		);
	});
	it("should return dependencies when resource not found", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "missing.txt"),
				loaders: [path.resolve(fixtures, "pitch-dependencies-loader.js")],
			},
			(err, result) => {
				err.should.be.instanceOf(Error);
				err.message.should.match(/ENOENT/i);
				result.fileDependencies.should.be.eql([
					`remainingRequest:${path.resolve(fixtures, "missing.txt")}`,
					path.resolve(fixtures, "missing.txt"),
				]);
				done();
			}
		);
	});
	it("should not return dependencies when loader not found", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "does-not-exist-loader.js")],
			},
			(err, result) => {
				err.should.be.instanceOf(Error);
				err.code.should.be.eql("MODULE_NOT_FOUND");
				err.message.should.match(/does-not-exist-loader\.js'($|\n)/i);
				result.should.be.eql({
					cacheable: false,
					fileDependencies: [],
					contextDependencies: [],
					missingDependencies: [],
				});
				done();
			}
		);
	});
	it("should not return dependencies when loader is empty object", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "module-exports-object-loader.js")],
			},
			(err, result) => {
				err.should.be.instanceOf(Error);
				err.message.should.match(
					/module-exports-object-loader.js' is not a loader \(must have normal or pitch function\)$/
				);
				result.should.be.eql({
					cacheable: false,
					fileDependencies: [],
					contextDependencies: [],
					missingDependencies: [],
				});
				done();
			}
		);
	});
	it("should not return dependencies when loader is otherwise invalid (string)", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "module-exports-string-loader.js")],
			},
			(err, result) => {
				err.should.be.instanceOf(Error);
				err.message.should.match(
					/module-exports-string-loader.js' is not a loader \(export function or es6 module\)$/
				);
				result.should.be.eql({
					cacheable: false,
					fileDependencies: [],
					contextDependencies: [],
					missingDependencies: [],
				});
				done();
			}
		);
	});
	it("should return dependencies when loader throws error", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "throws-error-loader.js")],
			},
			(err, result) => {
				err.should.be.instanceOf(Error);
				err.message.should.match(/^resource$/i);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				done();
			}
		);
	});
	it("should return dependencies when loader rejects promise", (done) => {
		let once = true;
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "promise-error-loader.js")],
			},
			(err, result) => {
				if (!once) return done(new Error("should not be called twice"));
				once = false;
				err.should.be.instanceOf(Error);
				err.message.should.match(/^resource$/i);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				done();
			}
		);
	});
	it("should use an ident if passed", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [
					{
						loader: path.resolve(fixtures, "pitching-loader.js"),
					},
					{
						loader: path.resolve(fixtures, "simple-loader.js"),
						options: {
							f() {},
						},
						ident: "my-ident",
					},
				],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql([
					`${path.resolve(
						fixtures,
						"simple-loader.js"
					)}??my-ident!${path.resolve(fixtures, "resource.bin")}:`,
				]);
				done();
			}
		);
	});
	it("should load a loader using System.import and process", (done) => {
		global.System = {
			import(moduleId) {
				return Promise.resolve(require(moduleId));
			},
		};
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				loaders: [path.resolve(fixtures, "simple-loader.js")],
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql(["resource-simple"]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "resource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
		delete global.System;
	});

	if (Number(process.versions.modules) >= 83) {
		it("should load a loader using import()", (done) => {
			runLoaders(
				{
					resource: path.resolve(fixtures, "resource.bin"),
					loaders: [
						{
							loader: path.resolve(fixtures, "esm-loader.mjs"),
							type: "module",
						},
					],
				},
				(err, result) => {
					if (err) return done(err);
					result.result.should.be.eql(["resource-esm"]);
					result.cacheable.should.be.eql(true);
					result.fileDependencies.should.be.eql([
						path.resolve(fixtures, "resource.bin"),
					]);
					result.contextDependencies.should.be.eql([]);
					done();
				}
			);
		});
	}
	it("should support escaping in resource", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "res\0#ource.bin"),
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql([Buffer.from("resource", "utf8")]);
				result.cacheable.should.be.eql(true);
				result.fileDependencies.should.be.eql([
					path.resolve(fixtures, "res#ource.bin"),
				]);
				result.contextDependencies.should.be.eql([]);
				done();
			}
		);
	});
	it("should have to correct keys in context when using escaping", (done) => {
		runLoaders(
			{
				resource: `${path.resolve(fixtures, "res\0#ource.bin")}?query\0#frag`,
				loaders: [`${path.resolve(fixtures, "keys-loader.js")}?loader\0#query`],
			},
			(err, result) => {
				if (err) return done(err);
				try {
					JSON.parse(result.result[0]).should.be.eql({
						context: fixtures,
						resource: `${path.resolve(fixtures, "res\0#ource.bin")}?query\0#frag`,
						resourcePath: path.resolve(fixtures, "res#ource.bin"),
						resourceQuery: "?query#frag",
						resourceFragment: "",
						loaderIndex: 0,
						query: "?loader#query",
						currentRequest: `${path.resolve(
							fixtures,
							"keys-loader.js"
						)}?loader\0#query!${path.resolve(
							fixtures,
							"res\0#ource.bin"
						)}?query\0#frag`,
						remainingRequest: `${path.resolve(fixtures, "res\0#ource.bin")}?query\0#frag`,
						previousRequest: "",
						request: `${path.resolve(
							fixtures,
							"keys-loader.js"
						)}?loader\0#query!${path.resolve(
							fixtures,
							"res\0#ource.bin"
						)}?query\0#frag`,
						data: null,
						loaders: [
							{
								request: `${path.resolve(fixtures, "keys-loader.js")}?loader\0#query`,
								path: path.resolve(fixtures, "keys-loader.js"),
								query: "?loader#query",
								fragment: "",
								data: null,
								pitchExecuted: true,
								normalExecuted: true,
							},
						],
					});
				} catch (err_) {
					return done(err_);
				}
				done();
			}
		);
	});

	describe("getContext", () => {
		const TESTS = [
			["/", "/"],
			["/path/file.js", "/path"],
			["/path/file.js#fragment", "/path"],
			["/path/file.js?query", "/path"],
			["/path/file.js?query#fragment", "/path"],
			["/path/\0#/file.js", "/path/#"],
			["/some/longer/path/file.js", "/some/longer/path"],
			["/file.js", "/"],
			["C:\\", "C:\\"],
			["C:\\file.js", "C:\\"],
			["C:\\some\\path\\file.js", "C:\\some\\path"],
			["C:\\path\\file.js", "C:\\path"],
			["C:\\path\\file.js#fragment", "C:\\path"],
			["C:\\path\\file.js?query", "C:\\path"],
			["C:\\path\\file.js?query#fragment", "C:\\path"],
			["C:\\path\\\0#\\file.js", "C:\\path\\#"],
		];
		for (const testCase of TESTS) {
			it(`should get the context of '${testCase[0]}'`, () => {
				getContext(testCase[0]).should.be.eql(testCase[1]);
			});
		}
	});
	it("should pass arguments from processResource", (done) => {
		runLoaders(
			{
				resource: path.resolve(fixtures, "resource.bin"),
				processResource(loaderContext, resourcePath, callback) {
					fs.readFile(resourcePath, (err, content) => {
						if (err) return callback(err);
						return callback(null, content, "source-map", "other-arg");
					});
				},
			},
			(err, result) => {
				if (err) return done(err);
				result.result.should.be.eql([
					Buffer.from("resource", "utf8"),
					"source-map",
					"other-arg",
				]);
				done();
			}
		);
	});
});
