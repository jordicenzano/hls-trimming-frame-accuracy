#!/usr/bin/env node

/**
 * Created by Jordi Cenzano on 05/30/16.
 */

//SUPER FAST FRAME ACCURACY HLS TRIMMING
// ***************************************************************

//TODO: JOC fix extra audio frames at the end (probably due to the introduces offset)
//TODO: JOC Only split the ones that needs:

//External
const fs = require('fs');
var path = require('path');
const child_process = require('child_process');

//Functions
function create_trim_obj(source, tmp_dir, in_file_ext, dest_file, in_trim_ts_ms, out_trim_ts_ms) {
    var dest_file_name = path.basename(dest_file);

    var ret = {
        "dest_file": dest_file,
        "tmp_dir": tmp_dir,
        "dest_file_name_video": path_join(tmp_dir, dest_file_name + ".video.ts"),
        "dest_file_name_audio": path_join(tmp_dir, dest_file_name + ".audio.aac"),
        "in_trim_ts_ms": in_trim_ts_ms,
        "out_trim_ts_ms": out_trim_ts_ms,
        "single_segment": false,
        "first_segment": null,
        "last_segment": null,
        "source_dir": "",
        "files": [],
        "segments": []
    };

    deleteFileIfExists(ret.dest_file);
    deleteFileIfExists(ret.dest_file_name_video);
    deleteFileIfExists(ret.dest_file_name_audio);

    //Check if source is a manifest
    if  ((source.length > 4) && (source.substring(source.length - 5, source.length).toLocaleLowerCase() == ".m3u8" ) ) {
        //Only manifest with relative paths are allowed

        //Read manifest
        var manifest = fs.readFileSync(source).toString();

        ret.files_array = getMediafilesFromManifest(manifest);
        console.log("Media files from manifest: " + ret.files_array.join(","));

        ret.source_dir = path.dirname(source);
        console.log("Manifest directory: " + ret.source_dir);
    }
    else {
        //Assume source is a directory
        //Read all .ts files from the source, and we assume we want to
        //trim in the 1st segment and trim out the last one
        ret.files_array = fs.readdirSync(source);

        //Del everything from array but .ts
        filterArray(ret.files_array, in_file_ext);

        ret.source_dir = source;
    }

    //Convert file name to path
    //addArray(files_array, source);

    return ret;
}

function findFirstSegment(trim_obj) {
    var n = 0;
    var last_segment = null;

    while ( (n < trim_obj.segments.length) && (trim_obj.first_segment == null) ) {
        var segment = trim_obj.segments[n];

        getSegmentFormat(segment);
        getSegmentStreamsData(segment);

        //If tin < first ts first segment then tin = 0
        if (trim_obj.in_trim_ts_ms <= (parseFloat(segment.video_stream.start_time) * 1000.0)) {
            if (n == 0)
                trim_obj.first_segment = segment;
            else
                trim_obj.first_segment = last_segment;
        }
        else {
            last_segment = segment;
        }
        n++;
    }

    if (trim_obj.first_segment != null) {
        if ( ("type" in trim_obj.first_segment) && (trim_obj.first_segment.type == "last") )
            trim_obj.first_segment.type = "first-last";
        else
            trim_obj.first_segment.type = "first";

        trim_obj.first_segment.video_uncompress_avi = path_join(trim_obj.tmp_dir, trim_obj.first_segment.original_segment_name + ".video.avi");
        trim_obj.first_segment.video_uncompress_avi_trimmed = path_join(trim_obj.tmp_dir, trim_obj.first_segment.original_segment_name + ".video.trimmed_in.avi");
        trim_obj.first_segment.video_compress_ts_trimmed = path_join(trim_obj.tmp_dir, trim_obj.first_segment.original_segment_name + ".video.trimmed_in.ts");
        trim_obj.first_segment.audio_compress_aac_trimmed = path_join(trim_obj.tmp_dir, trim_obj.first_segment.original_segment_name + ".audio.trimmed_in.aac");
    }

    return (trim_obj.first_segment != null);
}

function findLastSegment(trim_obj) {
    var n = trim_obj.segments.length - 1;
    var last_segment = null;

    while ( (n >= 0) && (trim_obj.last_segment == null) ) {
        var segment = trim_obj.segments[n];

        getSegmentFormat(segment);
        getSegmentStreamsData(segment);

        //If tin < first ts first segment then tin = 0
        if (trim_obj.out_trim_ts_ms >= ((parseFloat(segment.video_stream.start_time) + parseFloat(segment.video_stream.duration))* 1000.0)) {
            if (n == trim_obj.segments.length)
                trim_obj.last_segment = segment;
            else
                trim_obj.last_segment = last_segment;
        }
        else {
            last_segment = segment;
        }
        n--;
    }

    if (trim_obj.last_segment != null) {
        if ( ("type" in trim_obj.last_segment) && (trim_obj.last_segment.type == "first") )
            trim_obj.last_segment.type = "first-last";
        else
            trim_obj.last_segment.type = "last";

        trim_obj.last_segment.video_uncompress_avi = path_join(trim_obj.tmp_dir, trim_obj.last_segment.original_segment_name + ".video.avi");
        trim_obj.last_segment.video_uncompress_avi_trimmed = path_join(trim_obj.tmp_dir, trim_obj.last_segment.original_segment_name + ".video.trimmed_out.avi");
        trim_obj.last_segment.video_compress_ts_trimmed = path_join(trim_obj.tmp_dir, trim_obj.last_segment.original_segment_name + ".video.trimmed_out.ts");
        trim_obj.last_segment.audio_compress_aac_trimmed = path_join(trim_obj.tmp_dir, trim_obj.last_segment.original_segment_name + ".audio.trimmed_out.aac");
    }

    return (trim_obj.last_segment != null);
}

function findSegmentType(trim_obj) {

    //Create segments objects
    for (var n = 0; n < trim_obj.files_array.length; n++) {
        var obj = {
            "type": "unknown",
            "original_segment_name": trim_obj.files_array[n],
            "original_segment": path_join(trim_obj.source_dir, trim_obj.files_array[n]),
            "video_compress_ts": path_join(tmp_dir, trim_obj.files_array[n] + ".video.ts"),
            "audio_compress_aac": path_join(tmp_dir, trim_obj.files_array[n] + ".audio.aac")
        };
        trim_obj.segments.push(obj);
    }

    //Find the first segment based on input ts, assuming that all starts with I frame, and that the A/V delay in the input source is reasonable
    if (findFirstSegment(trim_obj) == false) {
        console.log("ERROR! Finding the first segment, probably the tin > last ts in the stream");
        return false;
    }

    //Find the last segment based on input ts, assuming that all starts with I frame, and that the A/V delay in the input source is reasonable
    if (findLastSegment(trim_obj) == false) {
        console.log("ERROR! Finding the last segment, probably the tout < first ts in the stream");
        return false;
    }

    if (trim_obj.first_segment.type == "") {
        //TODO: implement single segment version (in, and out points in the same segment)
        console.log("In this version we need the in and out points in different segments");
        return false;
    }
}

function getMediafilesFromManifest(str) {
    var lines = str.split('\n');
    var media = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();

        if ((line.length > 0) && (line[0] != "#"))
            media.push(line);
    }

    return media;
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

function splitVideoTSAudioAacFromTSFiles(trim_obj) {
    trim_obj.forEach(splitVideoTSAudioAacFromTSFile);
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
    if (!("file_format" in obj_segment)) {
        var cmd = "ffprobe -show_format -print_format json " + obj_segment.original_segment;
        obj_segment.file_format = JSON.parse(child_process.execSync(cmd));
    }

    return obj_segment.file_format;
}

function getSegmentStreamsData(obj_segment) {
    if ( (!("video_stream" in obj_segment)) && (!("audio_stream" in obj_segment)) ) {
        var cmd = "ffprobe -show_streams -print_format json " + obj_segment.original_segment;
        var streams_data =  JSON.parse(child_process.execSync(cmd));

        obj_segment.video_stream = getVideoStreamFromStreamData(streams_data);
        obj_segment.audio_stream = getAudioStreamFromStreamData(streams_data);
    }
}

function getVideoStreamFromStreamData(streams_data) {
    return getByTypeStream(streams_data, "video");
}

function getAudioStreamFromStreamData(streams_data) {
    return getByTypeStream(streams_data, "audio");
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

function catVideoSegments(trim_obj) {

    deleteFileIfExists(trim_obj.dest_file_name_video);

    var is_first_detected = false;
    var is_last_detected = false;

    var cat_str = "concat:";
    var n = 0;
    while ((n < trim_obj.segments.length) && (is_last_detected == false)) {
        var seg_obj = trim_obj.segments[n];

        if ((is_first_detected == false) && (seg_obj.type == "first"))
            is_first_detected = true;

        if (is_first_detected) {
            var file = seg_obj.video_compress_ts;
            if (("video_compress_ts_trimmed" in seg_obj) && (seg_obj.video_compress_ts_trimmed != ""))
                file = seg_obj.video_compress_ts_trimmed;

            cat_str = cat_str + file;

            if ((is_last_detected == false) && (seg_obj.type == "last"))
                is_last_detected = true;
            else
                cat_str = cat_str + "|";
        }
        n++;
    }

    var cmd_cat = "ffmpeg -i \"" + cat_str + "\" -c copy " + trim_obj.dest_file_name_video;
    child_process.execSync(cmd_cat);
}

function catAudioSegments(trim_obj) {
    deleteFileIfExists(trim_obj.dest_file_name_audio);

    var is_first_detected = false;
    var is_last_detected = false;

    var cat_str = "";
    var n = 0;
    while ((n < trim_obj.segments.length) && (is_last_detected == false)) {
        var seg_obj = trim_obj.segments[n];

        if ((is_first_detected == false) && (seg_obj.type == "first"))
            is_first_detected = true;

        if (is_first_detected) {
            var file = seg_obj.audio_compress_aac;
            if (("audio_compress_aac_trimmed" in seg_obj) && (seg_obj.audio_compress_aac_trimmed != ""))
                file = seg_obj.audio_compress_aac_trimmed;

            cat_str = cat_str + file;

            if ((is_last_detected == false) && (seg_obj.type == "last"))
                is_last_detected = true;
            else
                cat_str = cat_str + " ";
        }
        n++;
    }

    var cmd_cat = "cat " + cat_str + " > " + trim_obj.dest_file_name_audio;
    child_process.execSync(cmd_cat);
}

function muxAV(trim_obj, audio_delay_ms){
    deleteFileIfExists(trim_obj.dest_file);

    var cmd_mux = "ffmpeg -i " + trim_obj.dest_file_name_video + " -itsoffset " + audio_delay_ms / 1000.0 + " -i " + trim_obj.dest_file_name_audio + " -vcodec copy -acodec copy -absf aac_adtstoasc " + trim_obj.dest_file;

    child_process.execSync(cmd_mux);
}

function segmentDataValidation(trim_obj) {
    var ret = true;
    if ((trim_obj.first_segment.video_stream == null) || (trim_obj.first_segment.audio_stream == null) || (trim_obj.last_segment.video_stream == null) || (trim_obj.last_segment.audio_stream == null))
        ret = false;

    return ret;
}

function calcVideoTsToFrames(ts, video_stream) {
    return ts / ((1.0 / getFrameRate(video_stream)) * 1000.0);
}

function getVideoFramesInfo(obj_segment) {
    if (!("video_frames" in obj_segment))
        obj_segment.video_frames = getFramesInfo(obj_segment.video_compress_ts);

    return obj_segment.video_frames;
}

function getAudioFramesInfo(obj_segment) {
    if (!("audio_frames" in obj_segment))
        obj_segment.audio_frames = getFramesInfo(obj_segment.audio_compress_aac);

    return obj_segment.audio_frames;
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

function ShowVideoTrimPointsInfo(trim_obj) {

    console.log("Trim in segment (first): " + trim_obj.first_segment.original_segment);

    var num_in_trimmed_video_frames = calcVideoTsToFrames(trim_obj.first_segment.in_cut_video_ms, trim_obj.first_segment.video_stream);
    console.log("in_cut_ms (0 based):" + trim_obj.first_segment.in_cut_video_ms);
    console.log("Number of IN trimmed frames: " + num_in_trimmed_video_frames);

    var num_in_trimmed_video_frames_adjusted = calcVideoTsToFrames(trim_obj.first_segment.in_cut_video_ms_adjusted, trim_obj.first_segment.video_stream);
    console.log("in_cut_ms adjusted (0 based):" + trim_obj.first_segment.in_cut_video_ms_adjusted);
    console.log("Number of IN trimmed frames adjusted: " + num_in_trimmed_video_frames_adjusted);

    console.log("Trim out segment (last): " + trim_obj.last_segment.original_segment);

    var num_out_trimmed_video_frames = calcVideoTsToFrames(trim_obj.last_segment.out_cut_video_ms, trim_obj.last_segment.video_stream);
    console.log("out_cut_ms (0 based):" + trim_obj.last_segment.out_cut_video_ms);
    console.log("Number of OUT trimmed frames: " + num_out_trimmed_video_frames);

    var num_out_trimmed_video_frames_adjusted = calcVideoTsToFrames(trim_obj.last_segment.out_cut_video_ms_adjusted, trim_obj.last_segment.video_stream);
    console.log("out_cut_ms adjusted(0 based):" + trim_obj.last_segment.out_cut_video_ms_adjusted);
    console.log("Number of OUT trimmed frames adjusted: " + num_out_trimmed_video_frames_adjusted);
}

function ShowAudioTrimPointsInfo(trim_obj) {
    console.log("audio_in_data (0 based):" + JSON.stringify(trim_obj.first_segment.audio_in_data));
    console.log("audio_out_data (0 based):" + JSON.stringify(trim_obj.last_segment.audio_out_data));
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
    console.log("Example1: ./trim_hls_frame_acc /hls_test/ /out/test.mp4 /tmp 10.0 21.2");
    console.log("Example2: ./trim_hls_frame_acc/test.m3u8 /hls_test/ /out/test.mp4 /tmp 10.0 21.2");
    return 1;
}
var hls_source = process.argv[2];
var dest_file = process.argv[3];
var tmp_dir = process.argv[4];
var in_trim_ts_ms = parseFloat(process.argv[5]);
var out_trim_ts_ms = parseFloat(process.argv[6]);

var start_exec_ms = new Date().getTime();

var trim_obj = create_trim_obj(hls_source, tmp_dir, ".ts", dest_file, in_trim_ts_ms, out_trim_ts_ms);

//Find the segment type (first, last, middle) based on input and output trim points
if (findSegmentType(trim_obj) == false) {
    console.log("ERROR! Finding first and last segment");
    return 1;
}

//Get streams data from first and last segment
getSegmentFormat(trim_obj.first_segment);
getSegmentFormat(trim_obj.last_segment);

getSegmentStreamsData(trim_obj.first_segment);
getSegmentStreamsData(trim_obj.last_segment);

//Validations
if (segmentDataValidation(trim_obj) == false) {
    console.log("Error getting the video or audio data from first of last segment");
    return 1;
}

//Split A/V of every .ts
//Creates ts (video) and AAC (audio)
splitVideoTSAudioAacFromTSFiles(trim_obj.segments);

//Get video frames info for the first and last segments
getVideoFramesInfo(trim_obj.first_segment);
getVideoFramesInfo(trim_obj.last_segment);

//Calculate trim in VIDEO place from 1st segment (referenced to segment start = 0)
trim_obj.first_segment.in_cut_video_ms = trim_obj.in_trim_ts_ms - (trim_obj.first_segment.video_stream.start_time * 1000.0);
if (trim_obj.first_segment.in_cut_video_ms < 0) {
    console.log("Warning VIDEO in trim point < 0. Assumed no trim in!");
    trim_obj.first_segment.in_cut_video_ms = -1;
    trim_obj.first_segment.in_cut_video_ms_adjusted = -1;
}
else {
    //based on experience. Looks like ffmpeg -ss X start writing at the closest X
    var tmp = getVideoNextFrameData(trim_obj.first_segment, trim_obj.first_segment.in_cut_video_ms, -3);
    if (tmp == null) {
        console.log("Error getting the ts from first segment");
        return 1;
    }
    trim_obj.first_segment.in_cut_video_ms_adjusted = tmp.ffmpeg_ts_ms;
    trim_obj.first_segment.in_first_video_ts_ms = tmp.first_ts_in_the_file_ms;
}

//Calculate trim out VIDEO place from last segment (referenced to segment start = 0)
trim_obj.last_segment.out_cut_video_ms = trim_obj.out_trim_ts_ms - (trim_obj.last_segment.video_stream.start_time * 1000.0);
if (trim_obj.last_segment.out_cut_video_ms < 0) {
    console.log("Warning VIDEO out trim point < 0. Assumed NO trim out!");
    trim_obj.last_segment.out_cut_video_ms = -1;
    trim_obj.last_segment.out_cut_video_ms_adjusted = -1;
}
else {
    //based on experience. Looks like ffmpeg -t X start writing after the X
    var tmp = getVideoNextFrameData(trim_obj.last_segment, trim_obj.last_segment.out_cut_video_ms, 3);
    if (tmp == null) {
        console.log("Error getting the ts from last segment");
        return 1;
    }
    trim_obj.last_segment.out_cut_video_ms_adjusted = tmp.ffmpeg_ts_ms;
    trim_obj.last_segment.in_first_video_ts_ms = tmp.first_ts_in_the_file_ms;
}

//Show video cut points info Info
ShowVideoTrimPointsInfo(trim_obj);

//Convert 1st and last segments to YUV (raw)
convertToRaw(trim_obj.first_segment);
if (trim_obj.single_segment == false)
    convertToRaw(trim_obj.last_segment);

//Trim VIDEO initial segment
trimMediaByTs(trim_obj.first_segment, true, trim_obj.first_segment.in_cut_video_ms_adjusted);

//Trim VIDEO last segment
if (trim_obj.single_segment == false) {
    trimMediaByTs(trim_obj.last_segment, false, trim_obj.last_segment.out_cut_video_ms_adjusted);
}
else {
    //TODO: implement single segment version (in, and out points in the same segment)
    //trim if first and last segments are the same (use temp file)
}

//Encode first and last segment (with the same coding params than the original segment)
if (encodeVideoStream(trim_obj.first_segment) == false) {
    console.log("ERROR! Encoding the first segment (trimmed)");
    return 1;
}
if (encodeVideoStream(trim_obj.last_segment) == false) {
    console.log("ERROR! Encoding the last segment (trimmed)");
    return 1;
}

//Concatenate VIDEO using concat (including trimmed first and last segments)
catVideoSegments(trim_obj);

//Get audio frames info for the first and last segments
getAudioFramesInfo(trim_obj.first_segment);
getAudioFramesInfo(trim_obj.last_segment);

//Calculate in AUDIO point (referenced to segment start = 0)
trim_obj.first_segment.audio_in_data = getAudioNextFrameData(trim_obj.first_segment, trim_obj.first_segment.in_first_video_ts_ms);

//Calculate in AUDIO point (referenced to segment start = 0)
trim_obj.last_segment.audio_out_data = getAudioLastFrameData(trim_obj.last_segment, trim_obj.last_segment.in_first_video_ts_ms);

//Show audio cut points info Info
ShowAudioTrimPointsInfo(trim_obj);

//Trim AUDIO initial segment
trimInFileByBytes(trim_obj.first_segment.audio_compress_aac, trim_obj.first_segment.audio_compress_aac_trimmed, trim_obj.first_segment.audio_in_data.byte_start_pos);

//Trim AUDIO last segment
if (trim_obj.single_segment == false) {
    trimOutFileByBytes(trim_obj.last_segment.audio_compress_aac, trim_obj.last_segment.audio_compress_aac_trimmed, trim_obj.last_segment.audio_out_data.byte_end_pos);
}
else {
    //TODO: implement single segment version (in, and out points in the same segment)
    //trim if first and last segments are the same (use temp file)
}

//Concatenate AUDIO using simple cat (including trimmed first and last segments)
catAudioSegments(trim_obj);

//Mux A/V taking into account the AV delay form the first A/V frame
var audio_delay_ms = trim_obj.first_segment.audio_in_data.ts_ms - trim_obj.first_segment.in_first_video_ts_ms;
if (audio_delay_ms < 0) {
    audio_delay_ms = 0;
    console.log("Warning!!! audio delay < 0, something is wrong. Assumed audio_delay_ms = 0ms");
}

console.log("audio_delay_ms: " + audio_delay_ms);
muxAV(trim_obj, audio_delay_ms);

//End
var end_exec_ms = new Date().getTime();

console.log("Finished!!! Execution time: " + (end_exec_ms - start_exec_ms) / 1000.0);
return 0;