var Waterline = require('../node_modules/Waterline');

module.exports = {
	Header: Waterline.Collection.extend({
		identity: 'header',
		connection: 'connection',

		attributes: {
			maxSistring: 'integer',
			index: 'integer'
		}
	}),	

	Node: Waterline.Collection.extend({
		identity: "node",
		connection: 'connection',

		attributes: {
			parent: 'string',
			left: 'string',
			right: 'string',
			data: 'json'
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