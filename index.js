var Waterline = require('waterline');
var Promise = require('bluebird');
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
				data.maxSistringLength = 0;
				return tree.models.header.create(data);
			} else {
				return headers[0];
			}
			console.log("connected to db");
		}).then(function(header) {
			tree.header = header;
			//console.log(header);
			return tree.models.node.findOne({parent: 'root'});				
		}).then(function(root) {
			//console.log(root);
			if(root) {
				return root;
			} else {
				var root = new Node();
				//console.log(root);
				root.parent = 'root';
				return tree.models.node.create(root);
			}
		}).then(function(root) {
			tree.root = root;
			callback(tree);
		}).catch(function(err){
			throw err;
		});
	})

}

function Node() {
	this.parent = "";
	this.left = "";
	this.right = "";
	this.type = "";
}

function PATTree() {
}

PATTree.prototype = {

	INTERNAL: "internal",
	EXTERNAL: "external",

	close: function() {
		process.exit(1);
	},

	_getRoot: function() {
		return this.models.node.findOne({parent: 'root'});
	},	

	_resetDb: function() {
		var owner = this;
		var promises = [];
		for(var key in this.models) {
			promises.push(owner.models[key].drop());
		}
		return Promise.all(promises).then(function() {
			var data = {}
			data.maxSistringLength = 0;

			var root = new Node();
			root.parent = 'root';

			var promises = [];
			promises.push(owner.models.header.create(data));
			promises.push(owner.models.node.create(root));
			return promises;
		}).spread(function(header, root) {
			owner.header = header;
			owner.root = root;
			return Promise.resolve(owner);
		});
	},

	addDocument: function(doc) {
		var promises = [];
		var owner = this;
		var sentenses = utils.splitDocument(doc);
		var docRecord;
		return owner.models.rawdoc.create({content: doc}).then(function(doc1) {
			docRecord = doc1;
			return owner.models.splitdoc.create({rawDocId: docRecord.id, sentenses: sentenses});
		}).then(function() {
			var params = [];
			var preIndex = docRecord.id;
			for(var i = 0; i < sentenses.length; i++) {
				var index = preIndex + "." + i.toString();
				var param = {};
				param.sentense = sentenses[i];
				param.index = index;
				params.push(param);
			}
			//console.log(params);
			return Promise.reduce(params, function(total, param) {
				//console.log(param);
				return owner._addSentense(param.sentense, param.index).then(function() {
					console.log("done adding " + param.index + " sentense");
					return total++;
				});
			}, 0);
		});
	},

	addAllDocuments: function(docs) {
		var owner = this;
		return Promise.reduce(docs, function(total, doc) {
			return owner.addDocument(doc).then(function() {
				return total++;
			})
		}, 0);
	},

	_addSentense: function(sentense, sentenseIndex) {
		var owner = this;
		var params = [];
		var preIndex = sentenseIndex + ".";
		for(var i = 0; i < sentense.length; i++) {
			var charSistring = sentense.slice(i, sentense.length);
			var sistring = utils.toBinary(charSistring);
			var index = preIndex + i.toString();
			var param = {};
			param.sistring = sistring;
			param.index = index;
			params.push(param);
			//console.log("\tafter adding sistring " + charSistring + ":\n");
			//console.log("check connection: " + this._checkConnections());
			//this.printTreeContent();			
		}
		return Promise.reduce(params, function(count, param) {
			var sistring = param.sistring;
			var index = param.index;
			return owner._addSistring(sistring, index).then(function() {
				return count++;
			});
		}, 0)
	},

	_addSistring: function(sistring, index) {
		//console.log(sistring);
		//console.log(index);
		var owner = this;
		var promises = [];
		if(sistring.length > owner.header.maxSistringLength) {
			owner.header.maxSistringLength = sistring.length;
			promises.push(owner.models.header.update({id: owner.header.id}, owner.header));
			promises.push(owner._appendZeroes(owner.header.maxSistringLength));
		} else {
			for(var i = sistring.length; i < owner.header.maxSistringLength; i++) {
				sistring += "0";
			}			
		}
		//console.log("addSistring");
		//console.log("  sistring length: " + sistring.length);
		//console.log("  max sistring length: " + owner.header.maxSistringLength);
		return Promise.all(promises).then(function() {
			return owner._insert(owner.root, sistring, index);
		})

	},



	_insert: function(node, sistring, index) {
		var root = this.root;
		var owner = this;
		var indexes = [];
		indexes.push(index);
		//console.log(node.id == root.id);
		if(node.id == root.id && root.type == "") {
			root.type = this.EXTERNAL;
			root.sistring = sistring;
			root.indexes = indexes;
			/*
			root.data = {
				type: this.EXTERNAL,
				sistring: sistring,
				indexes: indexes
			};*/
			return this.models.node.update({id: root.id}, root).then(function(nodes) {
				return nodes[0];
			});
		} else if(node.type == this.INTERNAL) {
			var prefix = node.prefix;
			var position = node.position;
			var samePrefix = true;
			for(var i = 0; i < prefix.length; i++) {
				if(prefix[i] != sistring[i]) {
					samePrefix = false;
				}
			}
			if(samePrefix) {
				var branchBit = sistring[position].valueOf();
				if(branchBit == 0) {
					if(!node.left || node.left == "") {
						var leftChild =  new Node();
						/*
						leftChild.data = {
							type: this.EXTERNAL,
							sistring: sistring,
							indexes: indexes
						};
						*/
						leftChild.parent = node.id;
						leftChild.type = this.EXTERNAL;
						leftChild.sistring = sistring;
						leftChild.indexes = indexes;
						return this.models.node.create(leftChild).then(function(leftChild) {
							node.left = leftChild.id;
							return owner.models.node.update({id: node.id}, node);
						}).then(function(nodes) {
							return nodes[0];
						});
					} else {
						return this.models.node.findOne({id: node.left}).then(function(leftChild) {
							return owner._insert(leftChild, sistring, index);
						});
					}
				} else if(branchBit == 1) {
					if(!node.right || node.right == "") {
						var rightChild = new Node();
						/*
						rightChild.data = {
							type: this.EXTERNAL,
							sistring: sistring,
							indexes: indexes
						}
						*/
						rightChild.parent = node.id;
						rightChild.type = this.EXTERNAL;
						rightChild.sistring = sistring;
						rightChild.indexes = indexes;
						return this.models.node.create(rightChild).then(function(rightChild) {
							node.right = rightChild.id;
							return owner.models.node.update({id: node.id}, node);
						}).then(function(nodes) {
							return nodes[0];
						})
					} else {
						return this.models.node.findOne({id: node.right}).then(function(rightChild) {
							return owner._insert(rightChild, sistring, index);
						});
					}

				} else {
					throw "invalid bit number";
				}
			} else {
				//console.log("insert");
				//console.log("  internal, sistring length: " + sistring.length + ", sistring: "+ sistring);				
				return this._rebuildInternalSubtree(node, sistring, index);
			}
		} else if(node.type == this.EXTERNAL) {
			//console.log("insert");
			//console.log("  external, sistring length: " + sistring.length + ", sistring: "+ sistring);				
			if(node.sistring == sistring) {
				node.indexes.push(index);
				return this.models.node.update({id: node.id}, node).then(function(nodes) {
					return nodes[0];
				});
			} else {
				return this._rebuildInternalSubtree(node, sistring, index);
			}
		} else {
			throw "invalid node type (neither internal nor external)";
		}

	},

	_rebuildInternalSubtree: function(node, sistring, index) {
		var owner = this;
		var nodeString;
		var indexes = [];

		indexes.push(index);

		if(node.type == this.INTERNAL) {
			nodeString = node.prefix;
		} else if(node.type == this.EXTERNAL) {
			nodeString = node.sistring;
		}

		var branchBit = utils.findBranchPosition(nodeString, sistring);

		var externalNode = new Node();
		externalNode.type = this.EXTERNAL;
		externalNode.sistring = sistring;
		externalNode.indexes = indexes;
		/*
		externalNode.data = {
			type: this.EXTERNAL,
			sistring: sistring,
			indexes: indexes
		};
		*/

		var subtreeRoot = new Node();
		subtreeRoot.type = this.INTERNAL;
		subtreeRoot.position = branchBit;
		subtreeRoot.prefix = sistring.slice(0, branchBit);
		subtreeRoot.externalNodeNum = 0;
		subtreeRoot.totalFrequency = 0;

		/*
		subtreeRoot.data = {
			type: this.INTERNAL,
			position: branchBit,
			prefix: sistring.slice(0, branchBit),
			externalNodeNum: 0,
			totalFrequency: 0
			//sistringRepres: externalNode.id
		};
		*/

		var externalNodePromise = this.models.node.create(externalNode);
		var subtreePromise = this.models.node.create(subtreeRoot);
		var parentPromise = this.models.node.findOne({id: node.parent});

		return Promise.join(externalNodePromise, subtreePromise, parentPromise, function(externalNode, subtreeRoot, parent) {

			//console.log(node);
			//console.log(externalNode);
			//console.log(subtreeRoot);
			//console.log(parent);

			subtreeRoot.sistringRepres = externalNode.id;

			var type;

			if(node.parent == "root") {
				type = "root";
			} else if(node.id == parent.left) {
				//console.log(parent.left);
				type = "left";
				parent.left = "";
			} else if(node.id == parent.right) {
				type = "right";
				parent.right = "";
			}
			//console.log("rebuildInternalSubtree");
			//console.log("  sisting length: " + sistring.length + ", sisting: " + sistring);
			//console.log("  node string length: " + nodeString.length + ", sistring: " + nodeString);
			//console.log("  node type: " + node.type);
			//console.log("  branch bit: " + branchBit);
			var nodeBranchBit = nodeString[branchBit].valueOf();
			var sistringBranchBit = sistring[branchBit].valueOf();
			if(nodeBranchBit == 0 && sistringBranchBit == 1) {
				subtreeRoot.left = node.id;
				subtreeRoot.right = externalNode.id;
			} else if(nodeBranchBit == 1 && sistringBranchBit == 0) {
				subtreeRoot.left = externalNode.id;
				subtreeRoot.right = node.id;
			} else {
				throw "wrong branch bit";
			}
			externalNode.parent = subtreeRoot.id;
			node.parent = subtreeRoot.id;



			if(type == "root") {
				subtreeRoot.parent = "root";
				owner.root = subtreeRoot;
			} else if(type == "left") {
				parent.left = subtreeRoot.id;
				subtreeRoot.parent = parent.id;
			} else if(type == "right") {
				parent.right = subtreeRoot.id;
				subtreeRoot.parent = parent.id;
			} else {
				throw "invalid type (neither left nor right)";
			}

			nodePromise = owner.models.node.update({id: node.id}, node);
			externalNodePromise = owner.models.node.update({id: externalNode.id}, externalNode);
			subtreePromise = owner.models.node.update({id: subtreeRoot.id}, subtreeRoot);
			if(parent) {
				parentPromise = owner.models.node.update({id: parent.id}, parent);
			}

			return Promise.join(nodePromise, externalNodePromise, subtreePromise, parentPromise, function(nodes, externalNodes, subtreeRoots, parents) {
				node = nodes[0];
				externalNode = externalNodes[0];
				subtreeRoot = subtreeRoots[0];
				if(parents && parents.length > 0) {
					parent = parents[0]
				}
				//console.log(externalNode);
				//console.log(subtreeRoot);
				//console.log(parent);
				return owner._updateParents(subtreeRoot);
			});
		});

	},

	_updateParents: function(node) {
		//console.log(node);
		
		var owner = this;
		var leftPromise = this.models.node.findOne({id: node.left});
		var rightPromise = this.models.node.findOne({id: node.right});
		return Promise.join(leftPromise, rightPromise, function(left, right) {
			var externalNodeNum = 0;
			var totalFrequency = 0;
			//console.log("left " + left);
			//console.log("right " + right);
			if(left && right) {
				if(left.type == owner.INTERNAL) {
					externalNodeNum += left.externalNodeNum;
					totalFrequency += left.totalFrequency;
					//sistringRepres = sistringRepres.concat(left.data.sistringRepres);
				} else if(left.type == owner.EXTERNAL) {
					externalNodeNum += 1;
					totalFrequency += left.indexes.length;
					//sistringRepres.push(left);
				} else {
					console.trace();
					throw "unknown node type (neither internal nor external)"
				}
				if(right.type == owner.INTERNAL) {
					externalNodeNum += right.externalNodeNum;
					totalFrequency += right.totalFrequency;
					//sistringRepres = sistringRepres.concat(right.data.sistringRepres);
				} else if(right.type == owner.EXTERNAL) {
					externalNodeNum += 1;
					totalFrequency += right.indexes.length;
					//sistringRepres.push(right);
				} else {
					console.trace();
					throw "unknown node type (neither internal nor external)"
				}
			} else {
				console.trace();
				throw "internal node lost left or right child"
			}
			node.externalNodeNum = externalNodeNum;
			node.totalFrequency = totalFrequency;
			return owner.models.node.update({id: node.id}, node).then(function(nodes) {
				node = nodes[0];
				return owner.models.node.findOne({id: node.parent})
			}).then(function(parent) {
				if(parent) {
					return owner._updateParents(parent);
				} else {
					return node;
				}
			})
		})
	},


	_appendZeroes: function(length) {
		var owner = this;
		//console.log("appendZeroes");
		//console.log("  length: " + length);
		//console.log("  max sistring length: " + owner.header.maxSistringLength);
		return this.models.node.find({type: owner.EXTERNAL}).then(function(nodes) {
			var promises = [];
			//console.log("  nodes count: " + nodes.length);
			for(var i = 0; i < nodes.length; i++) {
				var node = nodes[i];
				//console.log(node);
				var sistringLen = node.sistring.length;
				if(sistringLen < length) {
					for(var j = sistringLen; j < length; j++) {
						node.sistring += "0";
					}
				}
				//console.log("  appendZeroes, sistring length: " + node.sistring.length);
				promises.push(owner.models.node.update({id: node.id}, node));
			}
			//console.log(" appendZeroes, promises length: " + promises.length);
			return Promise.all(promises);
		})
	}

}
