/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Tobias Koppers @sokra
 */
import fs = require('fs');

import loadLoader = require('./loadLoader');
const readFile = fs.readFile.bind(fs);

export interface LoaderObject {
    path: string
    query: string
    request: string
    options: any
    normal: null | ((request: string) => string)
    pitch: null | ((request: string) => string)
    raw: string
    data: any
    pitchExecuted: boolean
    normalExecuted: boolean
}

interface LoaderProcessOption {
    resourceBuffer: Buffer | null
    readResource: (path: string, callback: (err: NodeJS.ErrnoException | null, buf: Buffer | null) => void) => void
}

export interface RunLoaderOption {
    resource: string
    loaders: any[]
    context: any
    readResource: (filename: string, callback: (err: NodeJS.ErrnoException | null, data: Buffer | null) => void) => void
}

export interface RunLoaderResult {
    result?: (Buffer | null)[]
    resourceBuffer?: Buffer | null
    cacheable: boolean
    fileDependencies: string[]
    contextDependencies: string[]
}

export interface ExtendedLoaderContext {
    context: string | null
    loaderIndex: number
    loaders: LoaderObject[]
    resourcePath: string | undefined
    resourceQuery: string | undefined
    async: (() => (()=> void) | undefined) | null
    callback: (()=> void) | null
    cacheable: (flag: boolean) => void
    dependency: (file: string) => void
    addDependency: (file: string) => void
    addContextDependency: (context: string) => void
    getDependencies: () => string[]
    getContextDependencies: () => string[]
    clearDependencies: () => void
    resource: string
    request: string
    remainingRequest: string
    currentRequest: string
    previousRequest: string
    query: {
        [key: string]: any
    } | string
    data: any
}

function utf8BufferToString(buf: Buffer) {
    const str = buf.toString('utf-8');
    if (str.charCodeAt(0) === 0xFEFF) {
        return str.substr(1);
    }
    else {
        return str;
    }
}

function splitQuery(req: string): [string, string] {
    const i = req.indexOf('?');
    if (i < 0) {
        return [req, ''];
    }
    return [req.substr(0, i), req.substr(i)];
}

function dirname(path: string) {
    if (path === '/') {
        return '/';
    }
    const i = path.lastIndexOf('/');
    const j = path.lastIndexOf('\\');
    const i2 = path.indexOf('/');
    const j2 = path.indexOf('\\');
    const idx = i > j ? i : j;
    const idx2 = i > j ? i2 : j2;
    if (idx < 0) {
        return path;
    }
    if (idx === idx2) {
        return path.substr(0, idx + 1);
    }
    return path.substr(0, idx);
}

function createLoaderObject(loader: {}) {
    const obj = <LoaderObject>{
        path: '',
        query: '',
        options: null,
        normal: null,
        pitch: null,
        raw: '',
        data: null,
        pitchExecuted: false,
        normalExecuted: false
    };
    Object.defineProperty(obj, 'request', {
        enumerable: true,
        get() {
            return obj.path + obj.query;
        },
        set(value) {
            if (typeof value === 'string') {
                const splittedRequest = splitQuery(value);
                obj.path = splittedRequest[0];
                obj.query = splittedRequest[1];
                obj.options = undefined;
            }
            else {
                if (!value.loader) {
                    throw new Error(`request should be a string or object with loader and object (${JSON.stringify(value)})`);
                }
                obj.path = value.loader;
                obj.options = value.options;
                if (obj.options === null) {
                    obj.query = '';
                }
                else if (obj.options === undefined) {
                    obj.query = '';
                }
                else if (typeof obj.options === 'string') {
                    obj.query = `?${obj.options}`;
                }
                else if (typeof obj.options === 'object' && obj.options.ident) {
                    obj.query = `??${obj.options.ident}`;
                }
                else {
                    obj.query = `?${JSON.stringify(obj.options)}`;
                }
            }
        }
    });
    obj.request = loader as string;
    if (Object.preventExtensions) {
        Object.preventExtensions(obj);
    }
    return obj;
}

function runSyncOrAsync(
    fn: (request: string) => string,
    context: ExtendedLoaderContext,
    args: (Buffer | string | null)[],
    callback: (err?: Error | null, ...args: any[]) => any
) {
    let isSync = true;
    let isDone = false;
    let isError = false; // internal error
    let reportedError = false;
    context.async = function async() {
        if (isDone) {
            if (reportedError) {
                return;
            } // ignore
            throw new Error('async(): The callback was already called.');
        }
        isSync = false;
        return innerCallback;
    };
    let innerCallback = context.callback = function () {
        if (isDone) {
            if (reportedError) {
                return;
            } // ignore
            throw new Error('callback(): The callback was already called.');
        }
        isDone = true;
        isSync = false;
        try {
            callback.apply(null, arguments);
        } catch (e) {
            isError = true;
            throw e;
        }
    };
    try {
        const result = function LOADER_EXECUTION() {
            return fn.apply(context, args);
        }();
        if (isSync) {
            isDone = true;
            if (result === undefined) {
                return callback();
            }
            if (result && typeof result === 'object' && typeof result.then === 'function') {
                return result.catch(callback)
                    .then((r: Buffer | null) => {
                        callback(null, r);
                    });
            }
            return callback(null, result);
        }
    } catch (e) {
        if (isError) {
            throw e;
        }
        if (isDone) {
            // loader is already "done", so we cannot use the callback function
            // for better debugging we print the error on the console
            if (typeof e === 'object' && e.stack) {
                console.error(e.stack);
            }
            else {
                console.error(e);
            }
            return;
        }
        isDone = true;
        reportedError = true;
        callback(e);
    }
}

function convertArgs(args: (string | Buffer | null)[], raw: string) {
    if (!raw && Buffer.isBuffer(args[0])) {
        args[0] = utf8BufferToString(<Buffer>args[0]);
    }
    else if (raw && typeof args[0] === 'string') {
        args[0] = new Buffer(<string>args[0], 'utf-8');
    }
}

function iteratePitchingLoaders(
    options: LoaderProcessOption,
    loaderContext: ExtendedLoaderContext,
    callback: (err: Error | null, result?: (Buffer | null)[]) => any
): void {
    // abort after last loader
    if (loaderContext.loaderIndex >= loaderContext.loaders.length) {
        return processResource(options, loaderContext, callback);
    }

    const currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];

    // iterate
    if (currentLoaderObject.pitchExecuted) {
        loaderContext.loaderIndex++;
        return iteratePitchingLoaders(options, loaderContext, callback);
    }

    // load loader module
    loadLoader(currentLoaderObject, err => {
        if (err) {
            return callback(err);
        }
        const fn = currentLoaderObject.pitch;
        currentLoaderObject.pitchExecuted = true;
        if (!fn) {
            return iteratePitchingLoaders(options, loaderContext, callback);
        }
        currentLoaderObject.data = {}
        runSyncOrAsync(
            fn,
            loaderContext,
            [
                loaderContext.remainingRequest,
                loaderContext.previousRequest,
                currentLoaderObject.data
            ],
            function (err) {
                if (err) {
                    return callback(err);
                }
                const args = Array.prototype.slice.call(arguments, 1);
                if (args.length > 0) {
                    loaderContext.loaderIndex--;
                    iterateNormalLoaders(options, loaderContext, args, callback);
                }
                else {
                    iteratePitchingLoaders(options, loaderContext, callback);
                }
            });
    });
}

function processResource(options: LoaderProcessOption, loaderContext: ExtendedLoaderContext, callback: (err: Error) => any) {
    // set loader index to last loader
    loaderContext.loaderIndex = loaderContext.loaders.length - 1;

    const resourcePath = loaderContext.resourcePath;
    if (resourcePath) {
        loaderContext.addDependency(resourcePath);
        options.readResource(resourcePath, (err, buffer) => {
            if (err) {
                return callback(err);
            }
            options.resourceBuffer = buffer;
            iterateNormalLoaders(options, loaderContext, [buffer], callback);
        });
    }
    else {
        iterateNormalLoaders(options, loaderContext, [null], callback);
    }
}

function iterateNormalLoaders(
    options: LoaderProcessOption,
    loaderContext: ExtendedLoaderContext,
    args: (Buffer | null)[],
    callback: (err: Error | null, args?: (Buffer | null)[]) => any
): any {
    if (loaderContext.loaderIndex < 0) {
        return callback(null, args);
    }

    const currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];

    // iterate
    if (currentLoaderObject.normalExecuted) {
        loaderContext.loaderIndex--;
        return iterateNormalLoaders(options, loaderContext, args, callback);
    }

    const fn = currentLoaderObject.normal;
    currentLoaderObject.normalExecuted = true;
    if (!fn) {
        return iterateNormalLoaders(options, loaderContext, args, callback);
    }

    convertArgs(args, currentLoaderObject.raw);

    runSyncOrAsync(fn, loaderContext, args, function (err) {
        if (err) {
            return callback(err);
        }

        const args = Array.prototype.slice.call(arguments, 1);
        iterateNormalLoaders(options, loaderContext, args, callback);
    });
}

export function getContext(resource: string) {
    const splitted = splitQuery(resource);
    return dirname(splitted[0]);
}

export function runLoaders(
    options: RunLoaderOption,
    callback: (err: NodeJS.ErrnoException | null, result: RunLoaderResult) => any
) {
    // read options
    const resource = options.resource || '';
    let loaders = options.loaders || [];
    const loaderContext: ExtendedLoaderContext = options.context || {};
    const readResource = options.readResource || readFile;

    //
    const splittedResource = resource && splitQuery(resource);
    const resourcePath = splittedResource ? splittedResource[0] : undefined;
    const resourceQuery = splittedResource ? splittedResource[1] : undefined;
    const contextDirectory = resourcePath ? dirname(resourcePath) : null;

    // execution state
    let requestCacheable = true;
    const fileDependencies: string[] = [];
    const contextDependencies: string[] = [];

    // prepare loader objects
    loaders = loaders.map(createLoaderObject);

    loaderContext.context = contextDirectory;
    loaderContext.loaderIndex = 0;
    loaderContext.loaders = loaders;
    loaderContext.resourcePath = resourcePath;
    loaderContext.resourceQuery = resourceQuery;
    loaderContext.async = null;
    loaderContext.callback = null;
    loaderContext.cacheable = function cacheable(flag: boolean) {
        if (flag === false) {
            requestCacheable = false;
        }
    };
    loaderContext.dependency = loaderContext.addDependency = function addDependency(file: string) {
        fileDependencies.push(file);
    };
    loaderContext.addContextDependency = function addContextDependency(context: string) {
        contextDependencies.push(context);
    };
    loaderContext.getDependencies = function getDependencies() {
        return fileDependencies.slice();
    };
    loaderContext.getContextDependencies = function getContextDependencies() {
        return contextDependencies.slice();
    };
    loaderContext.clearDependencies = function clearDependencies() {
        fileDependencies.length = 0;
        contextDependencies.length = 0;
        requestCacheable = true;
    };
    Object.defineProperty(loaderContext, 'resource', {
        enumerable: true,
        get() {
            if (loaderContext.resourcePath === undefined) {
                return undefined;
            }
            return loaderContext.resourcePath + loaderContext.resourceQuery;
        },
        set(value) {
            const splittedResource = value && splitQuery(value);
            loaderContext.resourcePath = splittedResource ? splittedResource[0] : undefined;
            loaderContext.resourceQuery = splittedResource ? splittedResource[1] : undefined;
        }
    });
    Object.defineProperty(loaderContext, 'request', {
        enumerable: true,
        get() {
            return loaderContext.loaders.map(o => o.request)
                .concat(loaderContext.resource || '')
                .join('!');
        }
    });
    Object.defineProperty(loaderContext, 'remainingRequest', {
        enumerable: true,
        get() {
            if (loaderContext.loaderIndex >= loaderContext.loaders.length - 1 && !loaderContext.resource) {
                return '';
            }
            return loaderContext.loaders.slice(loaderContext.loaderIndex + 1)
                .map(o => o.request)
                .concat(loaderContext.resource || '')
                .join('!');
        }
    });
    Object.defineProperty(loaderContext, 'currentRequest', {
        enumerable: true,
        get() {
            return loaderContext.loaders.slice(loaderContext.loaderIndex)
                .map(o => o.request)
                .concat(loaderContext.resource || '')
                .join('!');
        }
    });
    Object.defineProperty(loaderContext, 'previousRequest', {
        enumerable: true,
        get() {
            return loaderContext.loaders.slice(0, loaderContext.loaderIndex).map(o => o.request).join('!');
        }
    });
    Object.defineProperty(loaderContext, 'query', {
        enumerable: true,
        get() {
            const entry = loaderContext.loaders[loaderContext.loaderIndex];
            return entry.options && typeof entry.options === 'object' ? entry.options : entry.query;
        }
    });
    Object.defineProperty(loaderContext, 'data', {
        enumerable: true,
        get() {
            return loaderContext.loaders[loaderContext.loaderIndex].data;
        }
    });

    // finish loader context
    if (Object.preventExtensions) {
        Object.preventExtensions(loaderContext);
    }

    const processOptions = {
        resourceBuffer: null,
        readResource
    };
    iteratePitchingLoaders(processOptions, loaderContext, (err: Error, result: (Buffer | null)[]) => {
        if (err) {
            return callback(err, {
                cacheable: requestCacheable,
                fileDependencies,
                contextDependencies
            });
        }
        callback(null, {
            result,
            resourceBuffer: processOptions.resourceBuffer,
            cacheable: requestCacheable,
            fileDependencies,
            contextDependencies
        });
    });
}
