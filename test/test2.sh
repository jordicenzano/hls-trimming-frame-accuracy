#!/bin/bash

# Created by Jordi Cenzano on 06/12/16.
# SUPER FAST FRAME ACCURACY HLS TRIMMING TEST CODE

#TEST2
# Input HLS manigest
# H264 Encoding with IP frames only

hls_source_manifest="/Users/jcenzano/Movies/hls_wowza/chunklist_vod.m3u8"
dest_file="/Users/jcenzano/Movies/hls_wowza/out/out_trimmed_test2.mp4"
tmp_dir="/Users/jcenzano/Movies/hls_wowza/tmp2"
log_file="$tmp_dir/test.txt"

#Trim 10 frames from the second segment. Assuming 30fps and startTimestamp of 2st chunk = 71340.250067s
#( 71340.250067 + ((1/30) * 10) ) * 1000.0
in_trim_ts_ms=71340583.4003333

#Trim all content after 60 frames of the 3rd segment. Assuming 30fps and startTimestamp of the 3rd chunk = 71346.250067s
#( 71346.250067 + ((1/30) * 60) ) * 1000.0
out_trim_ts_ms=71348250.067

#RESULT TEST2 TC OSD: Starts at: 17:07:34:02, ends at: 17:07:51:22

./trim_hls_frame_acc.js $hls_source_manifest $dest_file $tmp_dir $in_trim_ts_ms $out_trim_ts_ms > $log_file
