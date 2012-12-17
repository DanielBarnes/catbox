// Load modules

var Hoek = require('hoek');


// Declare internals

var internals = {};


exports.Connection = internals.Connection = function (options) {

    Hoek.assert(this.constructor === internals.Connection, 'Memory cache client must be instantiated using new');

    this.settings = options || {};
    this.cache = null;
    return this;
};


internals.Connection.prototype.start = function (callback) {

    if (!this.cache) {
        this.cache = {};
        this.byteSize = 0;
    }

    return callback();
};


internals.Connection.prototype.stop = function () {

    this.cache = null;
    this.byteSize = 0;
    return;
};


internals.Connection.prototype.isReady = function () {

    return (!!this.cache);
};


internals.Connection.prototype.validateSegmentName = function (name) {

    if (!name) {
        return new Error('Empty string');
    }

    if (name.indexOf('\0') !== -1) {
        return new Error('Includes null character');
    }

    return null;
};


internals.Connection.prototype.get = function (key, callback) {

    if (!this.cache) {
        return callback(new Error('Connection not started'));
    }

    var segment = this.cache[key.segment];
    if (!segment) {
        return callback(null, null);
    }

    var envelope = segment[key.id];
    if (!envelope) {
        return callback(null, null);
    }

    return callback(null, envelope);
};


internals.Connection.prototype.set = function (key, value, ttl, callback) {

    var self = this;

    if (!this.cache) {
        return callback(new Error('Connection not started'));
    }

    var envelope = {
        item: value,
        stored: Date.now(),
        ttl: ttl
    };

    this.cache[key.segment] = this.cache[key.segment] || {};
    var segment = this.cache[key.segment];

    var cachedItem = segment[key.id];
    if (cachedItem && cachedItem.timeoutId) {
        clearTimeout(cachedItem.timeoutId);

        if (cachedItem.byteSize) {
            self.byteSize -= cachedItem.byteSize;                   // If the item existed, decrement the byteSize as the value could be different
        }
    }

    if (this.settings.maxByteSize &&
        this.settings.maxByteSize > 0) {

        envelope.byteSize = internals.itemByteSize(value);

        if (self.byteSize + envelope.byteSize > this.settings.maxByteSize) {
            return callback(new Error('Cache size limit reached'));
        }
    }

    var timeoutId = setTimeout(function () {

        self.drop(key, function () { });
    }, ttl);

    envelope.timeoutId = timeoutId;

    segment[key.id] = envelope;
    return callback(null);
};


internals.Connection.prototype.drop = function (key, callback) {

    if (!this.cache) {
        return callback(new Error('Connection not started'));
    }

    var segment = this.cache[key.segment];
    if (segment) {
        var item = segment[key.id];

        if (item && item.byteSize) {
            this.byteSize -= item.byteSize;
        }

        delete segment[key.id];
    }

    return callback();
};


internals.itemByteSize = function (item) {

    if (item instanceof Date) {
        return 8;
    }

    if (item instanceof Array) {
        return internals.arrayByteSize(item);
    }

    var type = typeof item;

    if (type === 'object') {
        return internals.objectByteSize(item);
    }

    if (type === 'string') {
        return internals.stringByteSize(item);
    }

    if (type === 'boolean') {
        return 4;
    }

    if (type === 'number') {
        return 8;
    }

    return 0;       // Undefined
};


internals.objectByteSize = function (object) {

    var keys = Object.keys(object);
    var size = 8;                                           // Initial object overhead
    size += keys.length * 2;

    for (var i = 0, il = keys.length; i < il; ++i) {
        size += internals.itemByteSize(object[keys[i]]);
    }

    return size;
};


internals.stringByteSize = function (string) {

    return Buffer.byteLength(string);
};


internals.arrayByteSize = function (array) {

    var size = 0;
    for (var i = 0, il = array.length; i < il; ++i) {
        size += internals.itemByteSize(array[i]);
    }

    return size;
};