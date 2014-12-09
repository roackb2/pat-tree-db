var Waterline = require('waterline');
var BTree = require('./lib/BTree.js');
var models = require('./lib/models.js');
var utils = require('./lib/utils');

exports.connect = function(connection, callback) {
	var tree = new PATTree();
	tree.orm = new Waterline();
	var adapter = require(connection.adapter);
	connection.adapter = 'adapter';
	tree.config = {
		adapters: {
			adapter: adapter
		},

		connections: {
			connection: connection
		},

		defaults: {
			migrate: 'safe'
		}
	}

	for(var key in models) {
		tree.orm.loadCollection(models[key]);
	}

	tree.orm.initialize(tree.config, function(err, models) {
		if(err) throw err;

		tree.models = models.collections;
		tree.connections = models.connections;
		tree.models.header.find().then(function(headers) {
			//console.log(headers);
			if(headers.length > 1) {
				throw "multiple header";
			} else if(headers.length == 0) {
				var data = {}
				data.maxSistring = 0;
				tree.models.header.create(data).exec(function(err, header) {
					if(err) throw err;
					tree.header = header;
				})
			} else {
				tree.header = headers[0];
			}
			console.log("connected to db");
			callback(tree);
		}).catch(function(err){
			throw err;
		});
	})

}

function PATTree() {
}

PATTree.prototype = {

	INTERNAL: "internal",
	EXTERNAL: "external",

	testInsert: function(content) {
		return this.models.rawdoc.create({content: content});
	},

	close: function() {
		process.exit(1);
	},

	_insert: function(root, node, sistring, index) {
		var indexes = [];
		indexes.push(index);
		if(root.id == node.id && !root.data) {
			root.data = {
				type: this.EXTERNAL,
				sistring, sistring,
				indexes: indexes
			};
			this.models.node.update({id: root.id}, root).exec(function(err, node)) 
		}

	}


	_getRoot: function() {
		return this.models.node.find({parent: 'root'});
	},




}