"""
A single process-wide lock around the heavy drone background jobs
(COG conversion, index computation). Both do real GDAL/rasterio work
whose memory/CPU cost scales with the source file's size — letting two
run concurrently (e.g. uploading RGB and NIR back to back) stacks two
multi-hundred-MB-to-multi-GB operations on top of each other, which is
what was spiking memory/CPU hard enough to freeze the machine. This
serializes them: a bit more wall-clock time, never two heavy jobs at once.
"""

import threading

drone_processing_lock = threading.Lock()
