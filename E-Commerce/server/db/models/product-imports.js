var mongoose = require('mongoose');

var importsSchema = mongoose.Schema({
    importedDate: {
        type: Date,
        default: null
    },
    importedBy: {
        type: String,
        default: null
    },
    status: {
        type: String,
        defaut: "Draft" // Draft | Published
    }
});

module.exports = mongoose.model('imports', importsSchema, 'imports');