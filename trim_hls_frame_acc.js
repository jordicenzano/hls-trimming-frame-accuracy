#!/usr/bin/env node

/**
 * Created by Jordi Cenzano on 05/30/16.
 */

//SUPER FAST FRAME ACCURACY HLS TRIMMING
// ***************************************************************
    
//Future work:
//TODO: Handle single segment trims
//TODO: Use the manifest as input parameter, not directory
//TODO: Find the first and last segment based on segment timestamp, now we are assuming what are the 1st and last segments
//TODO: Add input parameters to the script (manifest, out_file, in_ts, out_ts), now they are hard coded

//External
const fs = require('fs');
var path = require('path');
const child_process = require('child_process');

//Functions
function create_split_obj(source_dir, tmp_dir, in_file_ext, dest_file, in_trim_ts_ms, out_trim_ts_ms) {

    var dest_file_name = path.basename(dest_file);

    var ret = {
        "dest_file": dest_file,
        "dest_file_name_video": path_join(tmp_dir, dest_file_name + ".video.ts"),
        "dest_file_name_audio": path_join(tmp_dir, dest_file_name + ".audio.aac"),
        "in_trim_ts_ms": in_trim_ts_ms,
        "out_trim_ts_ms": out_trim_ts_ms,
        "single_segment": false,
        "first_segment": null,
        "last_segment": null,
        "segments": []
    };

    deleteFileIfExists(ret.dest_file);
    deleteFileIfExists(ret.dest_file_name_video);
    deleteFileIfExists(ret.dest_file_name_audio);

    //Read all .ts files from the source_dir, and we assume we want to
    //trim in the 1st segment and trim out the last one
    var files_array = fs.readdirSync(source_dir);

    //Del everything from array but .ts
    filterArray(files_array, in_file_ext);

    //Convert file name to path
    //addArray(files_array, source_dir);

    for (var n = 0; n < files_array.length; n++) {
        var obj = {
            "type": "middle",
            "original_segment": path_join(source_dir, files_array[n]),
            "video_compress_ts": path_join(tmp_dir, files_array[n] + ".video.ts"),
            "audio_compress_aac": path_join(tmp_dir, files_array[n] + ".audio.aac")
        };

        if (files_array.length == 1) { //In-Out trim points same segment
            ret.single_segment = true;
            obj.type = "first-last";
            obj.video_uncompress_avi = files_array[n] + ".video.avi";
            obj.video_uncompress_avi_trimmed_in_tmp = path_join(tmp_dir, files_array[n] + ".video.trimmed_in.avi");
            obj.video_uncompress_avi_trimmed = path_join(tmp_dir, files_array[n] + ".video.trimmed_in_out.avi");
            obj.video_compress_ts_trimmed = path_join(tmp_dir, files_array[n] + ".video.trimmed_in_out.ts");

            ret.first_segment = obj;
            ret.last_segment = obj;
        }
        else if (n == 0) { //In segment data
            obj.type = "first";
            obj.video_uncompress_avi = path_join(tmp_dir, files_array[n] + ".video.avi");
            obj.video_uncompress_avi_trimmed = path_join(tmp_dir, files_array[n] + ".video.trimmed_in.avi");
            obj.video_compress_ts_trimmed = path_join(tmp_dir, files_array[n] + ".video.trimmed_in.ts");
            obj.audio_compress_aac_trimmed = path_join(tmp_dir, files_array[n] + ".audio.trimmed_in.aac");

            ret.first_segment = obj;
        }
        else if (n == (files_array.length - 1) ){ //Out segment data
            obj.type = "last";
            obj.video_uncompress_avi = path_join(tmp_dir, files_array[n] + ".video.avi");
            obj.video_uncompress_avi_trimmed = path_join(tmp_dir, files_array[n] + ".video.trimmed_out.avi");
            obj.video_compress_ts_trimmed = path_join(tmp_dir, files_array[n] + ".video.trimmed_out.ts");
            obj.audio_compress_aac_trimmed = path_join(tmp_dir, files_array[n] + ".audio.trimmed_out.aac");

            ret.last_segment = obj;
        }

        ret.segments.push(obj);
    }

    return ret;
}

function path_join(/* path segments */) {
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
}

function filterArray(array, ext) {
    for (var n = array.length - 1; n >= 0; n--) {
        if (array[n].indexOf(ext) != (array[n].length - ext.length))
            array.splice(n,1);
    }
}

function splitVideoTSAudioAacFromTSFiles(split_obj) {
    split_obj.forEach(splitVideoTSAudioAacFromTSFile);
}

function splitVideoTSAudioAacFromTSFile(obj_segment, index, array) {

    //Split V to ts (Needed to concat video)
    var destVts = obj_segment.video_compress_ts;
    deleteFileIfExists(destVts);
    var cmd_video_ts = "ffmpeg -i " + obj_segment.original_segment + " -vcodec copy -an " + destVts;
    child_process.execSync(cmd_video_ts);

    //Split A to AAC
    var destA = obj_segment.audio_compress_aac;
    deleteFileIfExists(destA);
    var cmd_audio = "ffmpeg -i " + obj_segment.original_segment + " -acodec copy -vn " + destA;
    child_process.execSync(cmd_audio);
}

function convertToRaw(obj_segment) {
    var destRAW = obj_segment.video_uncompress_avi;
    deleteFileIfExists(destRAW);

    var cmd_to_raw = "ffmpeg -i " + obj_segment.video_compress_ts + " -vcodec rawvideo " + destRAW;
    child_process.execSync(cmd_to_raw);
}

function trimInFileByBytes(source, dest, in_b) {
    deleteFileIfExists(dest);

    var cmd_to_raw = "dd if=" + source + " of=" + dest + " bs=1 skip=" + in_b;
    child_process.execSync(cmd_to_raw);
}

function trimOutFileByBytes(source, dest, count_b) {
    deleteFileIfExists(dest);

    var cmd_to_raw = "dd if=" + source + " of=" + dest + " bs=1 count=" + count_b;
    child_process.execSync(cmd_to_raw);
}

function deleteFileIfExists(file) {
    if (fs.existsSync(file) == true)
        fs.unlinkSync(file);
}

function getSegmentFormat(obj_segment) {
    var cmd = "ffprobe -show_format -print_format json " + obj_segment.original_segment;
    var out_str = child_process.execSync(cmd);

    return JSON.parse(out_str);
}

function getSegmentStreamsData(obj_segment) {

    var cmd = "ffprobe -show_streams -print_format json " + obj_segment.original_segment;
    var out_str = child_process.execSync(cmd);

    return JSON.parse(out_str);
}

function getVideoStream (streams) {
    return getByTypeStream(streams, "video");
}

function getAudioStream (streams) {
    return getByTypeStream(streams, "audio");
}

function getByTypeStream (streams, type, error_if_many) {
    var ret = null;

    if (typeof error_if_many === 'undefined')
        error_if_many = false;

    for (var n = 0; streams.streams.length; n++) {
        var stream = streams.streams[n];

        if (("codec_type" in stream ) && (stream.codec_type == type)) {
            if (ret == null) {
                if (error_if_many == false)
                    return stream;
                else
                    ret = stream;
            }
            else {
               return null;
            }
        }
    }

    return ret;
}

function getFrameRate(video_stream) {
    var str = "";
    var ret = 30.0;

    if ("r_frame_rate" in video_stream)
        str = video_stream.r_frame_rate;
    else if ("avg_frame_rate" in video_stream)
        str = video_stream.avg_frame_rate;
    else
        console.log("Warning!!! frame rate NOT detected, defaulted to 30fps");

    if (str != "") {
        var re = /(\d*)\/(\d*)/;
        var m = re.exec(str);
        if (m != null) {
            ret = parseFloat(m[1]) / parseFloat(m[2]);
        }
        else {
            var re = /(\d*)/;
            var m = re.exec(str);
            if (m != null)
                ret = parseFloat(m[1]);
        }
    }

    return ret;
}

function getInvTimeBase(video_stream) {
    var str = "";
    var ret = 90000.0;

    if ("time_base" in video_stream)
        str = video_stream.time_base;
    else
        console.log("Warning!!! time base NOT detected, defaulted to 1/90000");

    if (str != "") {
        var re = /(\d*)\/(\d*)/;
        var m = re.exec(str);
        if (m != null) {
            ret = parseFloat(m[2]) / parseFloat(m[1]);
        }
        else {
            var re = /(\d*)/;
            var m = re.exec(str);
            if (m != null)
                ret = parseFloat(m[1]);
        }
    }

    return ret;
}

function trimMediaByTs(obj_segment, is_trim_in, trim_point_ms) {
    var destTrimmedRAW = obj_segment.video_uncompress_avi_trimmed;
    var operator  = "-ss";
    if (is_trim_in == false)
        operator  = "-t";

    deleteFileIfExists(destTrimmedRAW);

    if (trim_point_ms > 0) {
        var cmd_to_trimmed_raw = "ffmpeg -i " + obj_segment.video_uncompress_avi + " " + operator + " " + (trim_point_ms / 1000.0) + " -vcodec copy " + destTrimmedRAW;
        console.log("TRIM: " + cmd_to_trimmed_raw);
        child_process.execSync(cmd_to_trimmed_raw);
    }
    else {
        var cmd_copy = "cp " + obj_segment.video_uncompress_avi + " " + destTrimmedRAW;
        child_process.execSync(cmd_copy);
    }
}

function encodeVideoStream(obj_segment) {
    var source = obj_segment.video_uncompress_avi_trimmed;
    var destTrimmedCompressed = obj_segment.video_compress_ts_trimmed;

    deleteFileIfExists(destTrimmedCompressed);

    var codec = "libx264";
    if (obj_segment.video_stream.codec_name != "h264") {
        console.log("ERROR! Not ready for different codec than h264");
        return false;
    }

    var bitrate_k = 2000;
    if (("bit_rate" in obj_segment.file_format) && (isNaN(obj_segment.file_format.bit_rate) == false))
        bitrate_k = parseInt(obj_segment.file_format.bit_rate, 10) / 1024.0;

    var codec_profile = "baseline";
    if (("profile" in obj_segment.video_stream) && (obj_segment.video_stream.profile != ""))
        codec_profile = obj_segment.video_stream.profile.toLowerCase();

    var codec_level_str = "3.1";
    if (("level" in obj_segment.video_stream) && (obj_segment.video_stream.level != ""))
        codec_level_str = (parseInt(obj_segment.video_stream.level, 10) / 10.0).toString();

    var cmd_to_trimmed_raw = "ffmpeg -i " + source + " -c:v " + codec + " -b:v " + bitrate_k + "k -profile:v " + codec_profile + " -level " + codec_level_str + " -f mpegts " + destTrimmedCompressed;
    child_process.execSync(cmd_to_trimmed_raw);

    return true;
}

function concatVideoSegments(split_obj) {

    deleteFileIfExists(split_obj.dest_file_name_video);

    var cat_str = "concat:";
    for (var n = 0; n < split_obj.segments.length; n++) {
        var seg_obj = split_obj.segments[n];

        var file = seg_obj.video_compress_ts;
        if ( ("video_compress_ts_trimmed" in seg_obj) && (seg_obj.video_compress_ts_trimmed != "") )
            file = seg_obj.video_compress_ts_trimmed;

        cat_str = cat_str + file;
        if (n < split_obj.segments.length - 1)
            cat_str = cat_str + "|";
    }

    var cmd_cat = "ffmpeg -i \"" + cat_str + "\" -c copy " + split_obj.dest_file_name_video;
    child_process.execSync(cmd_cat);
}

function catAudioSegments(split_obj) {
    deleteFileIfExists(split_obj.dest_file_name_audio);

    var cat_str = "";
    for (var n = 0; n < split_obj.segments.length; n++) {
        var seg_obj = split_obj.segments[n];

        var file = seg_obj.audio_compress_aac;
        if ( ("audio_compress_aac_trimmed" in seg_obj) && (seg_obj.audio_compress_aac_trimmed != "") )
            file = seg_obj.audio_compress_aac_trimmed;

        cat_str = cat_str + file;
        if (n < split_obj.segments.length - 1)
            cat_str = cat_str + " ";
    }

    var cmd_cat = "cat " + cat_str + " > " + split_obj.dest_file_name_audio;

    child_process.execSync(cmd_cat);
}

function muxAV(split_obj, audio_delay_ms){
    deleteFileIfExists(split_obj.dest_file);

    var cmd_mux = "ffmpeg -i " + split_obj.dest_file_name_video + " -itsoffset " + audio_delay_ms / 1000.0 + " -i " + split_obj.dest_file_name_audio + " -vcodec copy -acodec copy -absf aac_adtstoasc " + split_obj.dest_file;

    child_process.execSync(cmd_mux);
}

function getFirstAndLastSegmentFormatData(split_obj) {
    split_obj.first_segment.file_format = getSegmentFormat(split_obj.first_segment);
    if (split_obj.single_segment == false) {
        split_obj.last_segment.file_format = getSegmentFormat(split_obj.last_segment);
    }
    else {
        split_obj.last_segment.file_format = split_obj.first_segment.file_format;
    }
}

function getFirstAndLastSegmentStreamsData(split_obj) {
    var streams_first = getSegmentStreamsData(split_obj.first_segment);
    split_obj.first_segment.video_stream = getVideoStream(streams_first);
    split_obj.first_segment.audio_stream = getAudioStream(streams_first);
    if (split_obj.single_segment == false) {
        var streams_last = getSegmentStreamsData(split_obj.last_segment);
        split_obj.last_segment.video_stream = getVideoStream(streams_last);
        split_obj.last_segment.audio_stream = getAudioStream(streams_last);
    }
    else {
        split_obj.last_segment.video_stream = split_obj.first_segment.video_stream;
        split_obj.last_segment.audio_stream = split_obj.first_segment.audio_stream;
    }
}

function getFirstAndLastSegmentVideoFramesData(split_obj) {
    split_obj.first_segment.video_frames = getFramesInfo(split_obj.first_segment.video_compress_ts);
    if (split_obj.single_segment == false) {
        split_obj.last_segment.video_frames = getFramesInfo(split_obj.last_segment.video_compress_ts);
    }
    else {
        split_obj.last_segment.video_frames = split_obj.first_segment.video_frames;
    }
}

function getFirstAndLastSegmentAudioFramesData(split_obj) {
    split_obj.first_segment.audio_frames = getFramesInfo(split_obj.first_segment.audio_compress_aac);
    if (split_obj.single_segment == false) {
        split_obj.last_segment.audio_frames = getFramesInfo(split_obj.last_segment.audio_compress_aac);
    }
    else {
        split_obj.last_segment.audio_frames = split_obj.first_segment.audio_frames;
    }
}

function segmentDataValidation(split_obj) {
    var ret = true;
    if ((split_obj.first_segment.video_stream == null) || (split_obj.first_segment.audio_stream == null) || (split_obj.last_segment.video_stream == null) || (split_obj.last_segment.audio_stream == null))
        ret = false;

    return ret;
}

function calcVideoTsToFrames(ts, video_stream) {
    return ts / ((1.0 / getFrameRate(video_stream)) * 1000.0);
}

function getFramesInfo(media_file) {
    var cmd = "ffprobe -show_frames -print_format json " + media_file;
    var out_str = child_process.execSync(cmd);

    return JSON.parse(out_str);
}

function getVideoNextFrameData(obj_segment, ts_ms, delta_ms) {
    var n = 0;
    var ret = null;

    if (typeof delta_ms === 'undefined')
        delta_ms = 0.0;

    if (ts_ms > 0) {
        var trim_ts_ms = ts_ms + delta_ms; //0 based
        var current_pos_ms = 0.0;

        while ((ret == null) && (n < obj_segment.video_frames.frames.length)) {
            var frame = obj_segment.video_frames.frames[n];

            var frame_duration_ms = ((frame.pkt_duration * 1000.0) / getInvTimeBase(obj_segment.video_stream));

            if ((current_pos_ms + frame_duration_ms) > trim_ts_ms) {
                ret = {
                    "ffmpeg_ts_ms": current_pos_ms + (frame_duration_ms + 1) / 2.0,
                    "first_ts_in_the_file_ms": current_pos_ms + frame_duration_ms
                };
            }
            else {
                current_pos_ms = current_pos_ms + frame_duration_ms;
            }

            n++;
        }
    }

    return ret;
}

function getAudioLastFrameData(obj_segment, ts_ms) {
    var n = 0;
    var ret = null;

    if (ts_ms > 0) {
        var current_pos_ms = 0.0;

        while ((ret == null) && (n < obj_segment.audio_frames.frames.length)) {
            var frame = obj_segment.audio_frames.frames[n];
            var frame_duration_ms = frame.pkt_duration_time * 1000.0;

            if ((current_pos_ms + frame_duration_ms) > ts_ms) {
                ret = {
                    "ts_ms": current_pos_ms,
                    "byte_end_pos": parseInt(frame.pkt_pos)
                };
            }
            else {
                current_pos_ms = current_pos_ms + frame_duration_ms;
            }

            n++;
        }
    }

    return ret;
}

function getAudioNextFrameData(obj_segment, ts_ms) {
    var n = 0;
    var ret = null;

    if (ts_ms > 0) {
        var current_pos_ms = 0.0;

        while ((ret == null) && (n < obj_segment.audio_frames.frames.length)) {
            var frame = obj_segment.audio_frames.frames[n];
            var frame_duration_ms = frame.pkt_duration_time * 1000.0;

            if (current_pos_ms > ts_ms) {
                ret = {
                    "ts_ms": current_pos_ms,
                    "byte_start_pos": parseInt(frame.pkt_pos)
                };
            }
            else {
                current_pos_ms = current_pos_ms + frame_duration_ms;
            }

            n++;
        }
    }

    return ret;
}

function ShowVideoTrimPointsInfo(split_obj) {
    var num_in_trimmed_video_frames = calcVideoTsToFrames(split_obj.first_segment.in_cut_video_ms, split_obj.first_segment.video_stream);
    console.log("in_cut_ms (0 based):" + split_obj.first_segment.in_cut_video_ms);
    console.log("Number of IN trimmed frames: " + num_in_trimmed_video_frames);

    var num_in_trimmed_video_frames_adjusted = calcVideoTsToFrames(split_obj.first_segment.in_cut_video_ms_adjusted, split_obj.first_segment.video_stream);
    console.log("in_cut_ms adjusted (0 based):" + split_obj.first_segment.in_cut_video_ms_adjusted);
    console.log("Number of IN trimmed frames adjusted: " + num_in_trimmed_video_frames_adjusted);

    var num_out_trimmed_video_frames = calcVideoTsToFrames(split_obj.last_segment.out_cut_video_ms, split_obj.last_segment.video_stream);
    console.log("out_cut_ms (0 based):" + split_obj.last_segment.out_cut_video_ms);
    console.log("Number of OUT trimmed frames: " + num_out_trimmed_video_frames);

    var num_out_trimmed_video_frames_adjusted = calcVideoTsToFrames(split_obj.last_segment.out_cut_video_ms_adjusted, split_obj.last_segment.video_stream);
    console.log("out_cut_ms adjusted(0 based):" + split_obj.last_segment.out_cut_video_ms_adjusted);
    console.log("Number of OUT trimmed frames adjusted: " + num_out_trimmed_video_frames_adjusted);
}

function ShowAudioTrimPointsInfo(split_obj) {
    console.log("audio_in_data (0 based):" + JSON.stringify(split_obj.first_segment.audio_in_data));
    console.log("audio_out_data (0 based):" + JSON.stringify(split_obj.last_segment.audio_out_data));
}

//Test functions
function logArrayElements(element, index, array) {
    console.log('a[' + index + '] = ' + element);
}

//Main
//***********************

//Parse input data
if (process.argv.length != 7) {
    console.log("Incorrect number of arguments");
    console.log("You should use:");
    console.log("./trim_hls_frame_acc source_hls_dir dest_file tmp_dir trim_in trim_out\n");
    console.log("Example: ./trim_hls_frame_acc /hls_test/ /out/test.mp4 /tmp 10.0 21.2");
    return 1;
}
var hls_source_dir = process.argv[2];
var dest_file = process.argv[3];
var tmp_dir = process.argv[4];
var in_trim_ts_ms = parseFloat(process.argv[5]);
var out_trim_ts_ms = parseFloat(process.argv[6]);

var start_exec_ms = new Date().getTime();

var split_obj = create_split_obj(hls_source_dir, tmp_dir, ".ts", dest_file, in_trim_ts_ms, out_trim_ts_ms);

if (split_obj.segments.length <= 1) {
    //TODO: implement single segment version (in, and out points in the same segment)
    console.log("In this version we need more than 1 segment");
    return 1;
}

//Get streams data from first and last segment
getFirstAndLastSegmentFormatData(split_obj);
getFirstAndLastSegmentStreamsData(split_obj);

//Validations
if (segmentDataValidation(split_obj) == false) {
    console.log("Error getting the video or audio data from first of last segment");
    return 1;
}

//Split A/V of every .ts
//Creates ts (video) and AAC (audio)
splitVideoTSAudioAacFromTSFiles(split_obj.segments);

//Get video frames info for the first and last segments
getFirstAndLastSegmentVideoFramesData(split_obj);

//Calculate trim in VIDEO place from 1st segment (referenced to segment start = 0)
split_obj.first_segment.in_cut_video_ms = split_obj.in_trim_ts_ms - (split_obj.first_segment.video_stream.start_time * 1000.0);
if (split_obj.first_segment.in_cut_video_ms < 0) {
    console.log("Warning VIDEO in trim point < 0. Assumed no trim in!");
    split_obj.first_segment.in_cut_video_ms = -1;
    split_obj.first_segment.in_cut_video_ms_adjusted = -1;
}
else {
    //based on experience. Looks like ffmpeg -ss X start writing at the closest X
    var tmp = getVideoNextFrameData(split_obj.first_segment, split_obj.first_segment.in_cut_video_ms, -3);
    if (tmp == null) {
        console.log("Error getting the ts from first segment");
        return 1;
    }
    split_obj.first_segment.in_cut_video_ms_adjusted = tmp.ffmpeg_ts_ms;
    split_obj.first_segment.in_first_video_ts_ms = tmp.first_ts_in_the_file_ms;
}

//Calculate trim out VIDEO place from last segment (referenced to segment start = 0)
split_obj.last_segment.out_cut_video_ms = split_obj.out_trim_ts_ms - (split_obj.last_segment.video_stream.start_time * 1000.0);
if (split_obj.last_segment.out_cut_video_ms < 0) {
    console.log("Warning VIDEO out trim point < 0. Assumed NO trim out!");
    split_obj.last_segment.out_cut_video_ms = -1;
    split_obj.last_segment.out_cut_video_ms_adjusted = -1;
}
else {
    //based on experience. Looks like ffmpeg -t X start writing after the X
    var tmp = getVideoNextFrameData(split_obj.last_segment, split_obj.last_segment.out_cut_video_ms, 3);
    if (tmp == null) {
        console.log("Error getting the ts from last segment");
        return 1;
    }
    split_obj.last_segment.out_cut_video_ms_adjusted = tmp.ffmpeg_ts_ms;
    split_obj.last_segment.in_first_video_ts_ms = tmp.first_ts_in_the_file_ms;
}

//Show video cut points info Info
ShowVideoTrimPointsInfo(split_obj);

//Convert 1st and last segments to YUV (raw)
convertToRaw(split_obj.first_segment);
if (split_obj.single_segment == false)
    convertToRaw(split_obj.last_segment);

//Trim VIDEO initial segment
trimMediaByTs(split_obj.first_segment, true, split_obj.first_segment.in_cut_video_ms_adjusted);

//Trim VIDEO last segment
if (split_obj.single_segment == false) {
    trimMediaByTs(split_obj.last_segment, false, split_obj.last_segment.out_cut_video_ms_adjusted);
}
else {
    //TODO: implement single segment version (in, and out points in the same segment)
    //trim if first and last segments are the same (use temp file)
}

//Encode first and last segment (with the same coding params than the original segment)
if (encodeVideoStream(split_obj.first_segment) == false) {
    console.log("ERROR! Encoding the first segment (trimmed)");
    return 1;
}
if (encodeVideoStream(split_obj.last_segment) == false) {
    console.log("ERROR! Encoding the last segment (trimmed)");
    return 1;
}

//Concatenate VIDEO using concat (including trimmed first and last segments)
concatVideoSegments(split_obj);

//Get audio frames info for the first and last segments
getFirstAndLastSegmentAudioFramesData(split_obj);

//Calculate in AUDIO point (referenced to segment start = 0)
split_obj.first_segment.audio_in_data = getAudioNextFrameData(split_obj.first_segment, split_obj.first_segment.in_first_video_ts_ms);

//Calculate in AUDIO point (referenced to segment start = 0)
split_obj.last_segment.audio_out_data = getAudioLastFrameData(split_obj.last_segment, split_obj.last_segment.in_first_video_ts_ms);

//Show audio cut points info Info
ShowAudioTrimPointsInfo(split_obj);

//Trim AUDIO initial segment
trimInFileByBytes(split_obj.first_segment.audio_compress_aac, split_obj.first_segment.audio_compress_aac_trimmed, split_obj.first_segment.audio_in_data.byte_start_pos);

//Trim AUDIO last segment
if (split_obj.single_segment == false) {
    trimOutFileByBytes(split_obj.last_segment.audio_compress_aac, split_obj.last_segment.audio_compress_aac_trimmed, split_obj.last_segment.audio_out_data.byte_end_pos);
}
else {
    //TODO: implement single segment version (in, and out points in the same segment)
    //trim if first and last segments are the same (use temp file)
}

//Concatenate AUDIO using simple cat (including trimmed first and last segments)
catAudioSegments(split_obj);

//Mux A/V taking into account the AV delay form the first A/V frame
var audio_delay_ms = split_obj.first_segment.audio_in_data.ts_ms - split_obj.first_segment.in_first_video_ts_ms;
if (audio_delay_ms < 0) {
    audio_delay_ms = 0;
    console.log("Warning!!! audio delay < 0, something is wrong. Assumed audio_delay_ms = 0ms");
}

console.log("audio_delay_ms: " + audio_delay_ms);
muxAV(split_obj, audio_delay_ms);

//End
var end_exec_ms = new Date().getTime();

console.log("Finished!!! Execution time: " + (end_exec_ms - start_exec_ms) / 1000.0);
return 0;