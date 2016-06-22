#!/usr/bin/env node

/**
 * Created by Jordi Cenzano on 05/30/16.
 */

//SUPER FAST FRAME ACCURACY HLS TRIMMING
// ***************************************************************

//External
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const utils = require('./utils.js');

//Functions
exports.create_trim_obj = function(source, tmp_dir, in_file_ext, dest_file, in_trim_ts_ms, out_trim_ts_ms) {
    var dest_file_name = path.basename(dest_file);

    var ret = {
        "dest_file": dest_file,
        "tmp_dir": tmp_dir,
        "dest_file_name_video": utils.path_join(tmp_dir, dest_file_name + ".video.ts"),
        "dest_file_name_audio": utils.path_join(tmp_dir, dest_file_name + ".audio.aac"),
        "in_trim_ts_ms": in_trim_ts_ms,
        "out_trim_ts_ms": out_trim_ts_ms,
        "single_segment": false,
        "first_segment": null,
        "last_segment": null,
        "source_dir": "",
        "files": [],
        "segments": [],
        "trim_segments": []
    };

    utils.deleteFileIfExists(ret.dest_file);
    utils.deleteFileIfExists(ret.dest_file_name_video);
    utils.deleteFileIfExists(ret.dest_file_name_audio);

    //Check if source is a manifest
    if  ((source.length > 4) && (source.substring(source.length - 5, source.length).toLocaleLowerCase() == ".m3u8" ) ) {
        //Only manifest with relative paths are allowed

        //Read manifest
        var manifest = fs.readFileSync(source).toString();

        ret.files_array = utils.getMediafilesFromManifest(manifest);
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
        utils.filterArray(ret.files_array, in_file_ext);

        ret.source_dir = source;
    }

    //Convert file name to path
    //addArray(files_array, source);

    return ret;
};

exports.findFirstSegment = function(trim_obj) {
    var n = 0;

    while ( (n < trim_obj.segments.length) && (trim_obj.first_segment == null) ) {
        var segment = trim_obj.segments[n];

        this.getSegmentFormat(segment);
        this.getSegmentStreamsData(segment);

        var seg_ts_start_ms = parseFloat(segment.video_stream.start_time) * 1000.0;
        var seg_dur_ms = parseFloat(segment.video_stream.duration) * 1000.0;

        if ( (trim_obj.in_trim_ts_ms >= seg_ts_start_ms) && (trim_obj.in_trim_ts_ms < (seg_ts_start_ms + seg_dur_ms)) ) {
            trim_obj.first_segment = segment;
        }
        else if ( (n == 0) && (trim_obj.in_trim_ts_ms <= seg_ts_start_ms) ) {
            //If tin < first ts in first segment then assume the first segment is the first trim segment
            trim_obj.first_segment = segment;
        }

        n++;
    }

    if (trim_obj.first_segment != null) {
        if ( ("type" in trim_obj.first_segment) && (trim_obj.first_segment.type == "last") ) {
            this.setFirstLastSegmentData(trim_obj.first_segment, trim_obj.tmp_dir);
        }
        else {
            this.setFirstSegmentData(trim_obj.first_segment, trim_obj.tmp_dir);
        }
    }

    return (trim_obj.first_segment != null);
};

exports.findLastSegment = function(trim_obj) {
    var n = trim_obj.segments.length - 1;

    while ( (n >= 0) && (trim_obj.last_segment == null) ) {
        var segment = trim_obj.segments[n];

        this.getSegmentFormat(segment);
        this.getSegmentStreamsData(segment);

        var seg_ts_start_ms = parseFloat(segment.video_stream.start_time) * 1000.0;
        var seg_dur_ms = parseFloat(segment.video_stream.duration) * 1000.0;

        if ( (trim_obj.out_trim_ts_ms >= seg_ts_start_ms) && (trim_obj.out_trim_ts_ms < (seg_ts_start_ms + seg_dur_ms)) ) {
            trim_obj.last_segment = segment;
        }
        else if ( (n == (trim_obj.segments.length - 1) ) && (trim_obj.out_trim_ts_ms >= (seg_ts_start_ms + seg_dur_ms)) ) {
            //If tout >= last ts in last segment then assume the last segment is the last trim segment
            trim_obj.last_segment = segment;
        }

        n--;
    }

    if (trim_obj.last_segment != null) {
        if ( ("type" in trim_obj.last_segment) && (trim_obj.last_segment.type == "first") ) {
            trim_obj.last_segment.type = "first-last";
            this.setFirstLastSegmentData(trim_obj.first_segment, trim_obj.tmp_dir);
        }
        else {
            this.setLastSegmentData(trim_obj.last_segment, trim_obj.tmp_dir);
        }
    }

    return (trim_obj.last_segment != null);
};

exports.setFirstSegmentData = function(segment, tmp_dir) {
    segment.type = "first";

    segment.video_uncompress_avi = utils.path_join(tmp_dir, segment.original_segment_name + ".video.avi");
    segment.video_uncompress_avi_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_in.avi");
    segment.video_compress_ts_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_in.ts");
    segment.audio_compress_aac_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".audio.trimmed_in.aac");
};

exports.setLastSegmentData = function(segment, tmp_dir) {
    segment.type = "last";

    segment.video_uncompress_avi = utils.path_join(tmp_dir, segment.original_segment_name + ".video.avi");
    segment.video_uncompress_avi_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_out.avi");
    segment.video_compress_ts_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_out.ts");
    segment.audio_compress_aac_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".audio.trimmed_out.aac");
};

exports.setFirstLastSegmentData = function(segment, tmp_dir) {
    segment.type = "first-last";

    segment.video_uncompress_avi = utils.path_join(tmp_dir, segment.original_segment_name + ".video.avi");
    segment.video_uncompress_avi_trimmed_only_in = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_in_tmp.avi");
    segment.video_uncompress_avi_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_in_out.avi");
    segment.video_compress_ts_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".video.trimmed_in_out.ts");
    segment.audio_compress_aac_trimmed = utils.path_join(tmp_dir, segment.original_segment_name + ".audio.trimmed_in_out.aac");
};

exports.findSegmentType = function(trim_obj) {
    var tmp_dir = trim_obj.tmp_dir;

    //Create segments objects
    for (var n = 0; n < trim_obj.files_array.length; n++) {
        var obj = {
            "type": "unknown",
            "original_segment_name": trim_obj.files_array[n],
            "original_segment": utils.path_join(trim_obj.source_dir, trim_obj.files_array[n]),
            "video_compress_ts": utils.path_join(tmp_dir, trim_obj.files_array[n] + ".video.ts"),
            "audio_compress_aac": utils.path_join(tmp_dir, trim_obj.files_array[n] + ".audio.aac")
        };
        trim_obj.segments.push(obj);
    }

    //Find the first segment based on input ts, assuming that all starts with I frame, and that the A/V delay in the input source is reasonable
    if (this.findFirstSegment(trim_obj) == false) {
        console.log("ERROR! Finding the first segment, probably the tin > last ts in the stream");
        return false;
    }

    //Find the last segment based on input ts, assuming that all starts with I frame, and that the A/V delay in the input source is reasonable
    if (this.findLastSegment(trim_obj) == false) {
        console.log("ERROR! Finding the last segment, probably the tout < first ts in the stream");
        return false;
    }

    //Load segments involved to trim
    var is_first_detected = false;
    var is_last_detected = false;

    var n = 0;
    while ((n < trim_obj.segments.length) && (is_last_detected == false)) {
        var seg_obj = trim_obj.segments[n];

        if ( (is_first_detected == false) && ((seg_obj.type == "first") || (seg_obj.type == "first-last")) )
            is_first_detected = true;

        if (is_first_detected) {
            trim_obj.trim_segments.push(seg_obj);

            if ((is_last_detected == false) && ((seg_obj.type == "last") || (seg_obj.type == "first-last")) )
                is_last_detected = true;
        }
        n++;
    }

    if (trim_obj.trim_segments.length < 1) {
        console.log("ERROR! No segments to trim");
        return false;
    }
    else if (trim_obj.trim_segments.length == 1) {
        trim_obj.single_segment = true;
    }

    return true;
};

exports.splitVideoTSAudioAacFromTSFiles = function(segments) {
    segments.forEach(splitVideoTSAudioAacFromTSFile);
};

function splitVideoTSAudioAacFromTSFile(obj_segment, index, array) {
    var destVts = obj_segment.video_compress_ts;
    var destA = obj_segment.audio_compress_aac;

    console.log("Splitting A/V from: " + obj_segment.original_segment_name + "To: " + destVts + " and " + destA);

    //Split V to ts (Needed to concat video)
    utils.deleteFileIfExists(destVts);
    var cmd_video_ts = "ffmpeg -i " + obj_segment.original_segment + " -vcodec copy -an " + destVts;
    child_process.execSync(cmd_video_ts);

    //Split A to AAC
    utils.deleteFileIfExists(destA);
    var cmd_audio = "ffmpeg -i " + obj_segment.original_segment + " -acodec copy -vn " + destA;
    child_process.execSync(cmd_audio);
}

exports.convertToRaw = function(src, dst) {

    console.log("Decoding video from: " + src + " To: " + dst);

    utils.deleteFileIfExists(dst);

    var cmd_to_raw = "ffmpeg -i " + src + " -vcodec rawvideo " + dst;
    child_process.execSync(cmd_to_raw);
};

exports.getSegmentFormat = function(obj_segment) {
    if (!("file_format" in obj_segment)) {
        console.log("Getting format from: " + obj_segment.original_segment);

        var cmd = "ffprobe -show_format -print_format json " + obj_segment.original_segment;
        obj_segment.file_format = JSON.parse(child_process.execSync(cmd));
    }

    return obj_segment.file_format;
};

exports.getSegmentStreamsData = function(obj_segment) {
    if ( (!("video_stream" in obj_segment)) && (!("audio_stream" in obj_segment)) ) {
        console.log("Getting streams data from: " + obj_segment.original_segment);

        var cmd = "ffprobe -show_streams -print_format json " + obj_segment.original_segment;
        var streams_data =  JSON.parse(child_process.execSync(cmd));

        obj_segment.video_stream = this.getVideoStreamFromStreamData(streams_data);
        obj_segment.audio_stream = this.getAudioStreamFromStreamData(streams_data);
    }
};

exports.getVideoStreamFromStreamData = function(streams_data) {
    return this.getByTypeStream(streams_data, "video");
};

exports.getAudioStreamFromStreamData = function(streams_data) {
    return this.getByTypeStream(streams_data, "audio");
};

exports.getByTypeStream = function(streams, type, error_if_many) {
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
};

exports.getFrameRate = function(video_stream) {
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
};

exports.getInvTimeBase = function(video_stream) {
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
};

exports.trimMediaByTs = function(src, dst, is_trim_in, trim_point_ms) {
    var operator  = "-ss";
    if (is_trim_in == false)
        operator  = "-t";

    utils.deleteFileIfExists(dst);

    console.log("Trimming video from : " + src + " To: " + dst);

    if (trim_point_ms > 0) {
        var cmd_to_trimmed_raw = "ffmpeg -i " + src + " " + operator + " " + (trim_point_ms / 1000.0) + " -vcodec copy " + dst;
        child_process.execSync(cmd_to_trimmed_raw);
    }
    else {
        var cmd_copy = "cp " + src + " " + dst;
        child_process.execSync(cmd_copy);
    }
};

exports.encodeVideoStream = function(obj_segment) {
    var source = obj_segment.video_uncompress_avi_trimmed;
    var destTrimmedCompressed = obj_segment.video_compress_ts_trimmed;

    console.log("Encoding video from : " + source + " To: " + destTrimmedCompressed);

    utils.deleteFileIfExists(destTrimmedCompressed);

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
};

exports.catVideoSegments = function(segments, dst) {

    console.log("Concatenating video segments");

    utils.deleteFileIfExists(dst);

    var cat_str = "concat:";
    for (var n = 0; n < segments.length; n++) {
        var seg_obj = segments[n];

        var file = seg_obj.video_compress_ts;
        if ( ("video_compress_ts_trimmed" in seg_obj) && (seg_obj.video_compress_ts_trimmed != "") )
            file = seg_obj.video_compress_ts_trimmed;

        cat_str = cat_str + file;
        if (n < segments.length - 1)
            cat_str = cat_str + "|";
    }

    var cmd_cat = "ffmpeg -i \"" + cat_str + "\" -c copy " + dst;
    child_process.execSync(cmd_cat);
};

exports.catAudioSegments = function(segments, dst) {

    console.log("Concatenating audio segments");

    utils.deleteFileIfExists(dst);

    var cat_str = "";
    for (var n = 0; n < segments.length; n++) {
        var seg_obj = segments[n];

        var file = seg_obj.audio_compress_aac;
        if ( ("audio_compress_aac_trimmed" in seg_obj) && (seg_obj.audio_compress_aac_trimmed != "") )
            file = seg_obj.audio_compress_aac_trimmed;

        cat_str = cat_str + file;
        if (n < segments.length - 1)
            cat_str = cat_str + " ";
    }

    var cmd_cat = "cat " + cat_str + " > " + dst;
    child_process.execSync(cmd_cat);
};

exports.muxAV = function(src_video, src_audio, dst, audio_delay_ms){
    utils.deleteFileIfExists(dst);

    console.log("Muxing audio video to: " + dst);

    var cmd_mux = "ffmpeg -i " + src_video + " -itsoffset " + audio_delay_ms / 1000.0 + " -i " + src_audio + " -vcodec copy -acodec copy -absf aac_adtstoasc " + dst;

    child_process.execSync(cmd_mux);
};

exports.segmentDataValidation = function(segment) {
    var ret = true;
    if ( (segment.video_stream == null) || (segment.audio_stream == null) )
        ret = false;

    return ret;
};

exports.calcVideoTsToFrames = function(ts, video_stream) {
    return ts / ((1.0 / this.getFrameRate(video_stream)) * 1000.0);
};

exports.getVideoFramesInfo = function(obj_segment) {
    if (!("video_frames" in obj_segment))
        obj_segment.video_frames = this.getFramesInfo(obj_segment.video_compress_ts);

    return obj_segment.video_frames;
};

exports.getAudioFramesInfo = function(obj_segment) {
    if (!("audio_frames" in obj_segment))
        obj_segment.audio_frames = this.getFramesInfo(obj_segment.audio_compress_aac);

    return obj_segment.audio_frames;
};

exports.getFramesInfo = function(media_file) {
    console.log("Getting frames info of: " + media_file);

    var cmd = "ffprobe -show_frames -print_format json " + media_file;
    var out_str = child_process.execSync(cmd);

    return JSON.parse(out_str);
};

exports.getVideoNextFrameData = function(obj_segment, ts_ms, delta_ms) {
    var n = 0;
    var ret = null;

    if (typeof delta_ms === 'undefined')
        delta_ms = 0.0;

    if (ts_ms > 0) {
        var trim_ts_ms = ts_ms + delta_ms; //0 based
        var current_pos_ms = 0.0;

        while ((ret == null) && (n < obj_segment.video_frames.frames.length)) {
            var frame = obj_segment.video_frames.frames[n];

            var frame_duration_ms = ((frame.pkt_duration * 1000.0) / this.getInvTimeBase(obj_segment.video_stream));

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
};

exports.getAudioLastFrameData = function(obj_segment, ts_ms, initial_ts_ms) {
    var n = 0;
    var ret = null;

    if (ts_ms > 0) {
        var current_pos_ms = initial_ts_ms;

        while ((ret == null) && (n < obj_segment.audio_frames.frames.length)) {
            var frame = obj_segment.audio_frames.frames[n];
            var frame_duration_ms = parseFloat(frame.pkt_duration_time) * 1000.0;

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
};

exports.getAudioNextFrameData = function(obj_segment, ts_ms) {
    var n = 0;
    var ret = null;

    if (ts_ms > 0) {
        var current_pos_ms = 0.0;

        while ((ret == null) && (n < obj_segment.audio_frames.frames.length)) {
            var frame = obj_segment.audio_frames.frames[n];
            var frame_duration_ms = parseFloat(frame.pkt_duration_time) * 1000.0;

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
};

exports.ShowVideoTrimPointsInfo = function(trim_obj) {

    //In
    console.log("Trim in segment (first): " + trim_obj.first_segment.original_segment);

    var num_in_trimmed_video_frames = this.calcVideoTsToFrames(trim_obj.first_segment.in_cut_video_ms, trim_obj.first_segment.video_stream);
    console.log("in_cut_ms (0 based):" + trim_obj.first_segment.in_cut_video_ms);
    console.log("Number of IN trimmed frames: " + num_in_trimmed_video_frames);

    var num_in_trimmed_video_frames_adjusted = this.calcVideoTsToFrames(trim_obj.first_segment.in_cut_video_ms_adjusted, trim_obj.first_segment.video_stream);
    console.log("in_cut_ms adjusted (0 based):" + trim_obj.first_segment.in_cut_video_ms_adjusted);
    console.log("Number of IN trimmed frames adjusted: " + num_in_trimmed_video_frames_adjusted);

    //Out
    console.log("Trim out segment (last): " + trim_obj.last_segment.original_segment);

    var num_out_trimmed_video_frames = this.calcVideoTsToFrames(trim_obj.last_segment.out_cut_video_ms, trim_obj.last_segment.video_stream);
    console.log("out_cut_ms (0 based):" + trim_obj.last_segment.out_cut_video_ms);
    console.log("Number of OUT trimmed frames: " + num_out_trimmed_video_frames);

    var num_out_trimmed_video_frames_adjusted = this.calcVideoTsToFrames(trim_obj.last_segment.out_cut_video_ms_adjusted, trim_obj.last_segment.video_stream);
    console.log("out_cut_ms adjusted(0 based):" + trim_obj.last_segment.out_cut_video_ms_adjusted);
    console.log("Number of OUT trimmed frames adjusted: " + num_out_trimmed_video_frames_adjusted);
};

exports.ShowAudioTrimPointsInfo = function(trim_obj) {
    console.log("audio_in_data (0 based):" + JSON.stringify(trim_obj.first_segment.audio_in_data));
    console.log("audio_out_data (0 based):" + JSON.stringify(trim_obj.last_segment.audio_out_data));
};
