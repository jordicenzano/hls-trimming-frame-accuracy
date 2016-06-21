#!/bin/bash

# Created by Jordi Cenzano on 06/12/16.
# SUPER FAST FRAME ACCURACY HLS TRIMMING TEST CODE

#TEST3
# Input HLS manifest
# H264 Encoding with IP frames only
# In and Out point same segment

hls_source_manifest="/Users/jcenzano/Movies/hls_wowza/chunklist_vod.m3u8"
dest_file="/Users/jcenzano/Movies/hls_wowza/out/out_trimmed_test3.mp4"
tmp_dir="/Users/jcenzano/Movies/hls_wowza/tmp3"
log_file="$tmp_dir/test.txt"

#Trim 60 frames from the 4th segment. Assuming 30fps and startTimestamp of 4th chunk = 71352.250067s
#( 71352.250067 + ((1/30) * 60) ) * 1000.0
in_trim_ts_ms=71354250.067

#Trim all content after 150 frames of the 4th segment. Assuming 30fps and startTimestamp of the 4th chunk = 71352.250067s
#( 71352.250067 + ((1/30) * 150) ) * 1000.0
out_trim_ts_ms=71357250.067

#RESULT TEST3 TC OSD: Starts at: 17:07:51:22, ends at: 17:07:54:22

./trim_hls_frame_acc.js $hls_source_manifest $dest_file $tmp_dir $in_trim_ts_ms $out_trim_ts_ms > $log_file
