module.exports = function(source) {
	var callback = this.async();
	setTimeout(function() {
		callback(new Error(), null);
	}, 50);
};
