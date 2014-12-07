var Waterline = require('waterline');


module.exports = PATTree;

function PATTree(adapter, connection) {
	var owner = this;
	this.orm = new Waterline();
	adapter = require(adapter);
	connection.adapter = 'adapter';
	this.config = {
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

	//console.log(this.Header);

	for(var key in this.Definition) {
		this.orm.loadCollection(this.Definition[key]);
	}

	this.orm.initialize(this.config, function(err, models) {
		if(err) throw err;

		owner.models = models.collections;
		owner.models.header.find().then(function(headers) {
			//console.log(headers);
			if(headers.length > 1) {
				throw "multiple header";
			} else if(headers.length == 0) {
				var data = {}
				data.maxSistring = 0;
				data.index = 0;
				owner.models.header.create(data).exec(function(err, header) {
					if(err) throw err;
					owner.header = header;
				})
			} else {
				owner.header = headers[0];
			}
		}).catch(function(err){
			throw err;
		});
	})
}

PATTree.prototype = {

	Definition: {
		Header: Waterline.Collection.extend({
			identity: 'header',
			connection: 'connection',

			attributes: {
				maxSistring: 'integer',
				index: 'integer'
			}
		}),	

		Keyword: Waterline.Collection.extend({
			identity: 'keyword',
			connection: 'connection',

			attributes: {
				name: 'string'
			}
		}),

		RawDoc: Waterline.Collection.extend({
			identity: 'rawdoc',
			connection: 'connection',

			attributes: {
				content: 'string'
			}
		}),

		SplitDoc: Waterline.Collection.extend({
			identity: 'splitdoc',
			connection: 'connection',

			attributes: {
				sentences: 'array'
			}
		})
	}

}