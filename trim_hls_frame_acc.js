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
const seg = require('./segmenting_func.js');

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

var start_exec = new Date();
console.log("Start exec: " + start_exec.toISOString() );

var trim_obj = seg.create_trim_obj(hls_source, tmp_dir, ".ts", dest_file, in_trim_ts_ms, out_trim_ts_ms);

//Find the segment type (first, last, middle, or first-last) based on input and output trim points
if (seg.findSegmentType(trim_obj) == false) {
    console.log("ERROR! Finding first and last segment");
    return 1;
}

//Get streams data from first and last segment
seg.getSegmentFormat(trim_obj.first_segment);
seg.getSegmentFormat(trim_obj.last_segment);

seg.getSegmentStreamsData(trim_obj.first_segment);
seg.getSegmentStreamsData(trim_obj.last_segment);

//Validations
if ((seg.segmentDataValidation(trim_obj.first_segment) == false) || (seg.segmentDataValidation(trim_obj.last_segment) == false) ) {
    console.log("Error getting the video or audio data from first of last segment");
    return 1;
}

//Split A/V of every .ts
//Creates ts (video) and AAC (audio)
seg.splitVideoTSAudioAacFromTSFiles(trim_obj.trim_segments);

//Get video frames info for the first and last segments
seg.getVideoFramesInfo(trim_obj.first_segment);
seg.getVideoFramesInfo(trim_obj.last_segment);

//Calculate trim in VIDEO place from 1st segment (referenced to segment start = 0)
trim_obj.first_segment.in_cut_video_ms = trim_obj.in_trim_ts_ms - (trim_obj.first_segment.video_stream.start_time * 1000.0);
if (trim_obj.first_segment.in_cut_video_ms < 0) {
    console.log("Warning VIDEO in trim point < 0. Assumed no trim in!");
    trim_obj.first_segment.in_cut_video_ms = -1;
    trim_obj.first_segment.in_cut_video_ms_adjusted = -1;
}
else {
    //based on experience. Looks like ffmpeg -ss X start writing at the closest X
    var tmp = seg.getVideoNextFrameData(trim_obj.first_segment, trim_obj.first_segment.in_cut_video_ms, -3);
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
    var tmp = seg.getVideoNextFrameData(trim_obj.last_segment, trim_obj.last_segment.out_cut_video_ms, 3);
    if (tmp == null) {
        console.log("Error getting the ts from last segment");
        return 1;
    }
    trim_obj.last_segment.out_cut_video_ms_adjusted = tmp.ffmpeg_ts_ms;
    trim_obj.last_segment.out_first_video_ts_ms = tmp.first_ts_in_the_file_ms;
}

//Show video cut points info Info
seg.ShowVideoTrimPointsInfo(trim_obj);

//Convert 1st and last segments to YUV (raw)
seg.convertToRaw(trim_obj.first_segment.video_compress_ts, trim_obj.first_segment.video_uncompress_avi);
if (trim_obj.single_segment == false)
    seg.convertToRaw(trim_obj.last_segment.video_compress_ts, trim_obj.last_segment.video_uncompress_avi);

//Trim VIDEO first and last segment
if (trim_obj.single_segment == false) {
    seg.trimMediaByTs(trim_obj.first_segment.video_uncompress_avi, trim_obj.first_segment.video_uncompress_avi_trimmed, true, trim_obj.first_segment.in_cut_video_ms_adjusted);
    seg.trimMediaByTs(trim_obj.last_segment.video_uncompress_avi, trim_obj.last_segment.video_uncompress_avi_trimmed, false, trim_obj.last_segment.out_cut_video_ms_adjusted);
}
else {
    //trim if first and last segments are the same (use temp file)
    seg.trimMediaByTs(trim_obj.first_segment.video_uncompress_avi, trim_obj.first_segment.video_uncompress_avi_trimmed_only_in, true, trim_obj.first_segment.in_cut_video_ms_adjusted);

    var same_segment_out_cut_video_ms_adjusted = trim_obj.last_segment.out_cut_video_ms_adjusted - trim_obj.first_segment.in_cut_video_ms_adjusted;
    if (same_segment_out_cut_video_ms_adjusted < 0 ) {
        console.log("ERROR! Same_segment_out_cut_video_ms_adjusted < 0, something is wrong.");
        return 1;
    }
    else {
        console.log("same_segment_out_cut_video_ms_adjusted: " + same_segment_out_cut_video_ms_adjusted);
    }
    seg.trimMediaByTs(trim_obj.last_segment.video_uncompress_avi_trimmed_only_in, trim_obj.last_segment.video_uncompress_avi_trimmed, false, same_segment_out_cut_video_ms_adjusted);
}

//Encode first and last segment (with the same coding params than the original segment)
if (seg.encodeVideoStream(trim_obj.first_segment) == false) {
    console.log("ERROR! Encoding the first segment (trimmed)");
    return 1;
}
if (trim_obj.single_segment == false) {
    if (seg.encodeVideoStream(trim_obj.last_segment) == false) {
        console.log("ERROR! Encoding the last segment (trimmed)");
        return 1;
    }
}

//Concatenate VIDEO using concat (including trimmed first and last segments)
seg.catVideoSegments(trim_obj.trim_segments, trim_obj.dest_file_name_video);

//Get audio frames info for the first and last segments
seg.getAudioFramesInfo(trim_obj.first_segment);
seg.getAudioFramesInfo(trim_obj.last_segment);

//Calculate AUDIO IN point (referenced to segment start = 0)
trim_obj.first_segment.audio_in_data = seg.getAudioNextFrameData(trim_obj.first_segment, trim_obj.first_segment.in_first_video_ts_ms);

//Calculate the audio delay that we will introduce when we mux the final stream
var audio_delay_ms = trim_obj.first_segment.audio_in_data.ts_ms - trim_obj.first_segment.in_first_video_ts_ms;
if (audio_delay_ms < 0) {
    audio_delay_ms = 0;
    console.log("Warning!!! audio delay < 0, something is wrong. Assumed audio_delay_ms = 0ms");
}

//Calculate AUDIO OUT point (referenced to segment start = 0)
trim_obj.last_segment.audio_out_data = seg.getAudioLastFrameData(trim_obj.last_segment, trim_obj.last_segment.out_first_video_ts_ms, audio_delay_ms);

//Show audio cut points info Info
seg.ShowAudioTrimPointsInfo(trim_obj);

//Trim AUDIO first and last segment
if (trim_obj.single_segment == false) {
    utils.trimInFileByBytes(trim_obj.first_segment.audio_compress_aac, trim_obj.first_segment.audio_compress_aac_trimmed, trim_obj.first_segment.audio_in_data.byte_start_pos);
    utils.trimOutFileByBytes(trim_obj.last_segment.audio_compress_aac, trim_obj.last_segment.audio_compress_aac_trimmed, trim_obj.last_segment.audio_out_data.byte_end_pos);
}
else {
    //trim if first and last segments are the same (use temp file)
    utils.trimInOutFileByBytes(trim_obj.first_segment.audio_compress_aac, trim_obj.first_segment.audio_compress_aac_trimmed, trim_obj.first_segment.audio_in_data.byte_start_pos, trim_obj.last_segment.audio_out_data.byte_end_pos);
}

//Concatenate AUDIO using simple cat (including trimmed first and last segments)
seg.catAudioSegments(trim_obj.trim_segments, trim_obj.dest_file_name_audio);

//Mux A/V taking into account the AV delay form the first A/V frame
console.log("audio_delay_ms: " + audio_delay_ms);

seg.muxAV(trim_obj.dest_file_name_video, trim_obj.dest_file_name_audio, trim_obj.dest_file, audio_delay_ms);

//End
var end_exec = new Date();
console.log("End exec: " + end_exec.toISOString() );

console.log("Finished!!! Execution time: " + (end_exec.getTime() - start_exec.getTime()) / 1000.0);
return 0;
