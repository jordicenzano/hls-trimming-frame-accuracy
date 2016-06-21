#!/bin/bash

# Created by Jordi Cenzano on 06/12/16.
# SUPER FAST FRAME ACCURACY HLS TRIMMING TEST CODE

#TEST4
# Input HLS manifest
# H264 Encoding using IPB frames

hls_source_dir="/Users/jcenzano/Movies/wowza-test-3rend-test/transmux"
dest_file="/Users/jcenzano/Movies/hls_wowza/out/out_trimmed_test4.mp4"
tmp_dir="/Users/jcenzano/Movies/hls_wowza/tmp4"
log_file="$tmp_dir/test.txt"

#Trim 60 frames from the 4th segment. Assuming 30fps and startTimestamp of 4th chunk = 45099.460911s
#( 45099.460911 + ((1/30) * 60) ) * 1000.0
in_trim_ts_ms=45101460.911

#Trim all content after 150 frames of the 4th segment. Assuming 30fps and startTimestamp of the 4th chunk = 45109.460911s
#( 45109.460911 + ((1/30) * 150) ) * 1000.0
out_trim_ts_ms=45114460.911

#RESULT TEST4 TC OSD: Starts at: 17:06:20:17, ends at: 17:06:33:17

./trim_hls_frame_acc.js $hls_source_dir $dest_file $tmp_dir $in_trim_ts_ms $out_trim_ts_ms > $log_file
