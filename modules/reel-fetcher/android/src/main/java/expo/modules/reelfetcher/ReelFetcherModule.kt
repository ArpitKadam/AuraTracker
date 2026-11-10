package expo.modules.reelfetcher

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

class ReelFetcherModule : Module() {
  @Volatile private var initialized = false

  private fun ensureInit() {
    if (initialized) return
    synchronized(this) {
      if (initialized) return
      val ctx = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "React context is gone", null)
      try {
        YoutubeDL.getInstance().init(ctx)
        FFmpeg.getInstance().init(ctx)
      } catch (e: Exception) {
        throw CodedException("INIT_FAILED", "yt-dlp failed to initialise: ${e.message}", e)
      }
      initialized = true
    }
  }

  private fun durationSec(path: String): Double? {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(path)
      r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDoubleOrNull()?.div(1000.0)
    } catch (e: Exception) {
      null
    } finally {
      r.release()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ReelFetcher")

    // Returns the yt-dlp version. update=true tries a best-effort self-update first:
    // Instagram extraction breaks often and the bundled yt-dlp ages.
    AsyncFunction("init") { update: Boolean ->
      ensureInit()
      val ctx = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "React context is gone", null)
      var updateNote: String? = null
      if (update) {
        updateNote = try {
          YoutubeDL.getInstance().updateYoutubeDL(ctx, YoutubeDL.UpdateChannel.STABLE)?.toString()
        } catch (e: Exception) {
          "update failed: ${e.message}"
        }
      }
      mapOf("version" to YoutubeDL.getInstance().version(ctx), "update" to updateNote)
    }

    AsyncFunction("getInfo") { url: String ->
      ensureInit()
      try {
        val info = YoutubeDL.getInstance().getInfo(url)
        mapOf(
          "title" to info.title,
          "description" to info.description,
          "uploader" to info.uploader,
          "thumbnail" to info.thumbnail,
          "duration" to info.duration.toDouble(),
        )
      } catch (e: Exception) {
        throw CodedException("INFO_FAILED", e.message ?: "yt-dlp could not read this link", e)
      }
    }

    // format is a yt-dlp format selector; the JS side owns the "medium quality" choice.
    AsyncFunction("downloadVideo") { url: String, outDir: String, format: String ->
      ensureInit()
      val dir = File(outDir).apply { mkdirs() }
      dir.listFiles()?.filter { it.name.startsWith("reel.") }?.forEach { it.delete() }
      val req = YoutubeDLRequest(url).apply {
        addOption("--no-playlist")
        addOption("-f", format)
        addOption("--merge-output-format", "mp4")
        addOption("-o", "${dir.absolutePath}/reel.%(ext)s")
      }
      try {
        YoutubeDL.getInstance().execute(req)
      } catch (e: Exception) {
        throw CodedException("DOWNLOAD_FAILED", e.message ?: "yt-dlp download failed", e)
      }
      val f = dir.listFiles()?.firstOrNull { it.name.startsWith("reel.") && !it.name.endsWith(".part") }
        ?: throw CodedException("NO_FILE", "yt-dlp finished but produced no video file", null)
      mapOf("path" to f.absolutePath, "bytes" to f.length().toDouble(), "durationSec" to durationSec(f.absolutePath))
    }

    // Lossless cut into `parts` consecutive clips. Each clip after the first starts
    // OVERLAP_US early (and snaps back to a keyframe) so no sentence is lost at a cut.
    AsyncFunction("splitVideo") { path: String, parts: Int ->
      if (parts < 2) throw CodedException("BAD_ARGS", "parts must be at least 2", null)
      val totalSec = durationSec(path) ?: throw CodedException("NO_DURATION", "Cannot read video duration", null)
      val totalUs = (totalSec * 1_000_000).toLong()
      val src = File(path)
      val outs = ArrayList<String>()
      for (i in 0 until parts) {
        val startUs = if (i == 0) 0L else maxOf(0L, totalUs * i / parts - OVERLAP_US)
        val endUs = if (i == parts - 1) Long.MAX_VALUE else totalUs * (i + 1) / parts
        val out = File(src.parentFile, "${src.nameWithoutExtension}.part$i.mp4")
        out.delete()
        try {
          cut(path, out.absolutePath, startUs, endUs)
        } catch (e: Exception) {
          throw CodedException("SPLIT_FAILED", "Could not cut clip ${i + 1}: ${e.message}", e)
        }
        outs.add(out.absolutePath)
      }
      outs
    }
  }

  private fun cut(inPath: String, outPath: String, startUs: Long, endUs: Long) {
    val extractor = MediaExtractor()
    extractor.setDataSource(inPath)
    val rotation = MediaMetadataRetriever().let { r ->
      try {
        r.setDataSource(inPath)
        r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      } finally {
        r.release()
      }
    }
    val muxer = MediaMuxer(outPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    muxer.setOrientationHint(rotation)
    var started = false
    try {
      val trackMap = HashMap<Int, Int>()
      for (t in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(t).getString(android.media.MediaFormat.KEY_MIME) ?: continue
        if (mime.startsWith("video/") || mime.startsWith("audio/")) {
          extractor.selectTrack(t)
          trackMap[t] = muxer.addTrack(extractor.getTrackFormat(t))
        }
      }
      if (trackMap.isEmpty()) throw IllegalStateException("no audio or video track")
      muxer.start()
      started = true
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val buf = ByteBuffer.allocate(2 * 1024 * 1024)
      val info = MediaCodec.BufferInfo()
      var offsetUs = -1L
      while (true) {
        buf.clear()
        val size = extractor.readSampleData(buf, 0)
        if (size < 0) break
        val t = extractor.sampleTime
        if (t > endUs) break
        if (offsetUs < 0) offsetUs = t
        info.set(0, size, maxOf(0L, t - offsetUs), extractor.sampleFlags)
        trackMap[extractor.sampleTrackIndex]?.let { muxer.writeSampleData(it, buf, info) }
        extractor.advance()
      }
    } finally {
      if (started) muxer.stop()
      muxer.release()
      extractor.release()
    }
  }

  companion object {
    private const val OVERLAP_US = 1_500_000L
  }
}
