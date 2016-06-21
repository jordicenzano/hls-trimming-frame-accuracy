#!/bin/bash

# Created by Jordi Cenzano on 06/12/16.
# SUPER FAST FRAME ACCURACY HLS TRIMMING TEST CODE

#TEST1:
# Input directory of HLS chunks
# H264 Encoding with IP frames only

hls_source_dir="/Users/jcenzano/Movies/hls_wowza/"
dest_file="/Users/jcenzano/Movies/hls_wowza/out/out_trimmed_test1.mp4"
tmp_dir="/Users/jcenzano/Movies/hls_wowza/tmp1"
log_file=$tmp_dir/test.txt

#Trim 10 frames from the first segment. Assuming 30fps and startTimestamp of 1st chunk = 71336.250067s
#( 71336.250067 + ((1/30) * 10) ) * 1000.0
in_trim_ts_ms=71336583.4003333

#Trim all content after 60 frames of the last segment. Assuming 30fps and startTimestamp of the last chunk = 71352.250067s
#( 71352.250067 + ((1/30) * 60) ) * 1000.0
out_trim_ts_ms=71354250.067

#RESULT TEST1 TC OSD: Starts at: 17:07:34:02, ends at: 17:07:51:22

./trim_hls_frame_acc.js $hls_source_dir $dest_file $tmp_dir $in_trim_ts_ms $out_trim_ts_ms > $log_file
