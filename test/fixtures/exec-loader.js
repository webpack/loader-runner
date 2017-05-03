module.exports = function(source) {
	return JSON.stringify(this.exec(source, this.resource)());
};
