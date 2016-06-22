/**
 * Created by Jordi Cenzano on 05/30/16.
 */

//SUPER FAST FRAME ACCURACY HLS TRIMMING
// ***************************************************************

//External
const fs = require('fs');
const child_process = require('child_process');

exports.getMediafilesFromManifest = function(str) {
    var lines = str.split('\n');
    var media = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();

        if ((line.length > 0) && (line[0] != "#"))
            media.push(line);
    }

    return media;
};

exports.path_join = function(/* path segments */) {
    //Only for file system paths
    var root_prefix = "";

    // Split the inputs into a list of path commands.
    var parts = [];
    for (var i = 0, l = arguments.length; i < l; i++) {
        parts = parts.concat(arguments[i].split("/"));
    }

    var newParts = [];
    for (i = 0, l = parts.length; i < l; i++) {
        var part = parts[i];
        // Remove leading and trailing slashes
        // Also remove "." segments
        if ((!part) && (i == 0))
            root_prefix = "/";

        if (!part) continue;

        if (newParts.length <= 0) {
            if (part.length > 0) {
                if ((part[0] != ".") && (part[0] != "..") && (part[0] != "~") && (root_prefix == "")) {
                    newParts.push(".");//If nothing indicates the root assume relative to local
                }
            }
        }
        // Push new path segments.
        newParts.push(part);
    }
    return root_prefix + newParts.join("/");
};

exports.filterArray = function(array, ext) {
    for (var n = array.length - 1; n >= 0; n--) {
        if (array[n].indexOf(ext) != (array[n].length - ext.length))
            array.splice(n,1);
    }
};

exports.trimInFileByBytes = function(src, dst, in_b) {
    this.deleteFileIfExists(dst);

    console.log("Trimming IN audio from: " + src + " To: " + dst + ". In bytes: " + in_b);


    var cmd_to_raw = "cat " + src + "| tail -c+" + in_b + " > " + dst;
    //var cmd_to_raw = "dd if=" + src + " of=" + dst + " bs=1 skip=" + in_b;
    child_process.execSync(cmd_to_raw);

};

exports.trimOutFileByBytes = function(src, dst, count_b) {
    this.deleteFileIfExists(dst);

    console.log("Trimming OUT audio from: " + src + " To: " + dst + ". Count bytes: " + count_b);

    var cmd_to_raw = "cat " + src + "| head -c" + count_b + " > " + dst;
    //var cmd_to_raw = "dd if=" + src + " of=" + dst + " bs=1 count=" + count_b;
    child_process.execSync(cmd_to_raw);
};

exports.trimInOutFileByBytes = function(src, dst, in_b, out_b) {
    this.deleteFileIfExists(dst);

    console.log("Trimming OUT audio from: " + src + " To: " + dst + ". In bytes: " + in_b +  ", Count bytes: " + out_b);

    var cmd_to_raw = "cat " + src + "| tail -c+" + in_b + " | head -c"+ (out_b - in_b) + " > " + dst;
    //var cmd_to_raw = "dd if=" + src + " of=" + dst + " bs=1 skip=" + in_b + " count=" + (out_b - in_b);
    child_process.execSync(cmd_to_raw);
};

exports.deleteFileIfExists = function(file) {
    if (fs.existsSync(file) == true)
        fs.unlinkSync(file);
};