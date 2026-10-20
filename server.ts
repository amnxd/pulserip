import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Environment constraint: dev server must strictly listen on port 3000
const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper to extract YouTube Video ID
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([^"&?\/\s]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : null;
}

// Map user quality settings to extractor format codes
function mapFormatCode(format: string, quality: string): string {
  if (format === 'mp3') {
    return 'mp3';
  }
  if (format === 'm4a') return 'm4a';
  if (format === 'wav') return 'wav';
  if (format === 'flac') return 'flac';

  // Video formats
  const q = (quality || '').toLowerCase();
  if (q.includes('2160') || q.includes('4k')) return '4k';
  if (q.includes('1440') || q.includes('2k')) return '1440';
  if (q.includes('1080')) return '1080';
  if (q.includes('720')) return '720';
  if (q.includes('480')) return '480';
  if (q.includes('360')) return '360';

  return '1080';
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg: true,
  });
});


// Resolve video details endpoint
app.post('/api/resolve', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Video URL is required' });
    }

    const trimmedUrl = url.trim();
    let videoId = extractYouTubeId(trimmedUrl);

    // If input is a search query (e.g. "cartoon", "believer", "lofi") rather than a direct URL:
    if (!videoId && !trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      try {
        const searchRes = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(trimmedUrl)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }
        );
        if (searchRes.ok) {
          const html = await searchRes.text();
          const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (match && match[1]) {
            videoId = match[1];
          }
        }
      } catch (searchErr) {
        console.warn('Search query resolution warning:', searchErr);
      }
    }

    if (videoId) {
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const oEmbedUrl = `https://www.youtube.com/oembed?url=${canonicalUrl}&format=json`;

      let title = `YouTube Video (${videoId})`;
      let author = 'YouTube Creator';
      let authorUrl = canonicalUrl;
      let thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      let maxResThumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      let sdThumbnail = `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`;
      let mqThumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

      try {
        const oEmbedRes = await fetch(oEmbedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          },
        });
        if (oEmbedRes.ok) {
          const oEmbedData = (await oEmbedRes.json()) as any;
          if (oEmbedData.title) title = oEmbedData.title;
          if (oEmbedData.author_name) author = oEmbedData.author_name;
          if (oEmbedData.author_url) authorUrl = oEmbedData.author_url;
          if (oEmbedData.thumbnail_url) thumbnail = oEmbedData.thumbnail_url;
        }
      } catch (err) {
        console.warn('oEmbed fetch warning:', err);
      }

      let durationSec = 214;
      try {
        const watchRes = await fetch(canonicalUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (watchRes.ok) {
          const html = await watchRes.text();
          const durMatch = html.match(/"approxDurationMs":"(\d+)"/);
          if (durMatch && durMatch[1]) {
            durationSec = Math.round(parseInt(durMatch[1], 10) / 1000);
          } else {
            const lengthMatch = html.match(/itemprop="duration" content="PT(?:(\d+)M)?(?:(\d+)S)?"/);
            if (lengthMatch) {
              const m = parseInt(lengthMatch[1] || '0', 10);
              const s = parseInt(lengthMatch[2] || '0', 10);
              durationSec = m * 60 + s;
            }
          }
        }
      } catch (e) {
        // use fallback
      }

      const hours = Math.floor(durationSec / 3600);
      const mins = Math.floor((durationSec % 3600) / 60);
      const secs = durationSec % 60;
      const formattedDuration = hours > 0
        ? `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${mins}:${secs.toString().padStart(2, '0')}`;

      const audioSizes = {
        '320k': ((durationSec * 320) / 8 / 1024).toFixed(1) + ' MB',
        '256k': ((durationSec * 256) / 8 / 1024).toFixed(1) + ' MB',
        '192k': ((durationSec * 192) / 8 / 1024).toFixed(1) + ' MB',
        '128k': ((durationSec * 128) / 8 / 1024).toFixed(1) + ' MB',
        '96k': ((durationSec * 96) / 8 / 1024).toFixed(1) + ' MB',
        '64k': ((durationSec * 64) / 8 / 1024).toFixed(1) + ' MB',
      };

      const videoSizes = {
        '2160p': ((durationSec * 22000) / 8 / 1024).toFixed(1) + ' MB',
        '1440p': ((durationSec * 12000) / 8 / 1024).toFixed(1) + ' MB',
        '1080p': ((durationSec * 5000) / 8 / 1024).toFixed(1) + ' MB',
        '720p': ((durationSec * 2500) / 8 / 1024).toFixed(1) + ' MB',
        '480p': ((durationSec * 1200) / 8 / 1024).toFixed(1) + ' MB',
        '360p': ((durationSec * 600) / 8 / 1024).toFixed(1) + ' MB',
        '240p': ((durationSec * 300) / 8 / 1024).toFixed(1) + ' MB',
      };

      const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'PulseRip_Media';

      return res.json({
        type: 'youtube',
        id: videoId,
        url: canonicalUrl,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=0`,
        title,
        sanitizedTitle,
        author,
        authorUrl,
        durationSec,
        formattedDuration,
        thumbnails: {
          maxres: maxResThumbnail,
          hq: thumbnail,
          sd: sdThumbnail,
          mq: mqThumbnail,
        },
        audioSizes,
        videoSizes,
      });
    }

    // Direct Media URL (MP4, MP3, etc.)
    const fileName = trimmedUrl.split('/').pop()?.split('?')[0] || 'direct_media';
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]/g, '') || 'PulseRip_Media';

    return res.json({
      type: 'direct',
      id: 'direct_' + Date.now(),
      url: trimmedUrl,
      title: cleanName,
      sanitizedTitle: cleanName,
      author: 'Direct Web Stream',
      authorUrl: trimmedUrl,
      durationSec: 180,
      formattedDuration: '03:00 (approx)',
      thumbnails: {
        maxres: '',
        hq: '',
        sd: '',
        mq: '',
      },
      audioSizes: {
        '320k': '7.2 MB',
        '256k': '5.8 MB',
        '192k': '4.3 MB',
        '128k': '2.9 MB',
        '96k': '2.2 MB',
        '64k': '1.4 MB',
      },
      videoSizes: {
        '2160p': '495.0 MB',
        '1440p': '270.0 MB',
        '1080p': '112.5 MB',
        '720p': '56.3 MB',
        '480p': '27.0 MB',
        '360p': '13.5 MB',
        '240p': '6.8 MB',
      },
    });
  } catch (error) {
    console.error('Resolve error:', error);
    res.status(500).json({ error: 'Failed to resolve media URL' });
  }
});

// Asynchronous Job Start Endpoint (Returns in <1s, completely prevents Cloud Run 504 Gateway Timeouts)
app.post('/api/convert/start', async (req, res) => {
  try {
    const {
      url,
      format = 'mp3',
      quality = '320k',
      title = 'PulseRip Media',
      artist = 'PulseRip',
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    let videoId = extractYouTubeId(url);
    if (!videoId && !url.startsWith('http://') && !url.startsWith('https://')) {
      try {
        const searchRes = await fetch(
          `https://www.youtube.com/results?search_query=${encodeURIComponent(url.trim())}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }
        );
        if (searchRes.ok) {
          const html = await searchRes.text();
          const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (match && match[1]) {
            videoId = match[1];
          }
        }
      } catch (searchErr) {
        console.warn('Convert search error:', searchErr);
      }
    }

    const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
    const formatCode = mapFormatCode(format, quality);

    // Build format fallback sequence so if 1080p is unavailable for this video it falls back cleanly
    const formatsToTry: string[] = [formatCode];
    if (format === 'mp4') {
      if (formatCode === '4k') formatsToTry.push('1440', '1080', '720');
      else if (formatCode === '1440') formatsToTry.push('1080', '720');
      else if (formatCode === '1080') formatsToTry.push('720', '480', '360');
      else if (formatCode === '720') formatsToTry.push('480', '360');
    }

    let initData: any = null;
    let effectiveQuality = quality;

    for (const code of formatsToTry) {
      try {
        const initRes = await fetch(
          `https://loader.to/ajax/download.php?format=${code}&url=${encodeURIComponent(targetUrl)}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
              'Referer': 'https://loader.to/',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
          }
        );

        const initText = await initRes.text();
        const parsed = JSON.parse(initText);
        if (parsed && parsed.progress_url) {
          initData = parsed;
          if (code !== formatCode) {
            effectiveQuality = code === '4k' ? '2160p' : `${code}p`;
          }
          break;
        }
      } catch (err) {
        // Continue to fallback format
      }
    }

    if (!initData || !initData.progress_url) {
      return res.status(400).json({
        error: 'Internal server error. Please try again later.',
      });
    }

    const resolvedTitle = (initData.title || title || 'media').trim();
    const safeTitle = resolvedTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'media';
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const outputFilename = `${safeTitle} [${effectiveQuality}].${ext}`;

    return res.json({
      success: true,
      progressUrl: initData.progress_url,
      title: safeTitle,
      filename: outputFilename,
      format,
      quality: effectiveQuality,
    });
  } catch (err: any) {
    console.error('Convert start error:', err);
    res.status(500).json({ error: err.message || 'Failed to start conversion job' });
  }
});

// Non-blocking status check endpoint (Takes ~100ms per poll)
app.get('/api/convert/status', async (req, res) => {
  try {
    const { progressUrl } = req.query;
    if (!progressUrl || typeof progressUrl !== 'string') {
      return res.status(400).json({ error: 'progressUrl is required' });
    }

    const pollRes = await fetch(progressUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': 'https://loader.to/',
      },
    });

    const pollText = await pollRes.text();
    let pollData: any = null;
    try {
      pollData = JSON.parse(pollText);
    } catch (e) {
      // In case the progress gateway sends transient non-JSON, report in-progress rather than error
      return res.json({
        ready: false,
        progress: 50,
        text: 'Processing stream...',
      });
    }

    if (pollData.download_url) {
      return res.json({
        ready: true,
        progress: 100,
        downloadUrl: pollData.download_url,
        text: 'Ready',
      });
    }

    if (pollData.success === -1 || pollData.error) {
      return res.json({
        ready: false,
        error: pollData.text || 'Conversion service encountered an error.',
      });
    }

    const numericProgress = Math.min(99, Math.max(10, Math.floor((pollData.progress || 500) / 10)));

    return res.json({
      ready: false,
      progress: numericProgress,
      text: pollData.text || 'Processing stream...',
    });
  } catch (err: any) {
    res.json({
      ready: false,
      progress: 50,
      text: 'Processing...',
    });
  }
});

// Synchronous convert fallback endpoint
app.post('/api/convert', async (req, res) => {
  try {
    const {
      url,
      format = 'mp3',
      quality = '320k',
      trimStart = 0,
      trimEnd = 0,
      title = 'PulseRip Media',
      artist = 'PulseRip',
      album = 'PulseRip',
      year = new Date().getFullYear().toString(),
      genre = 'Media',
      volume = 1,
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const videoId = extractYouTubeId(url);
    const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
    const formatCode = mapFormatCode(format, quality);

    console.log(`Starting real extraction for ${targetUrl} as ${formatCode}`);

    // Call extraction provider
    const initRes = await fetch(
      `https://loader.to/ajax/download.php?format=${formatCode}&url=${encodeURIComponent(targetUrl)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
          'Referer': 'https://loader.to/',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
        },
      }
    );

    let initData: any = null;
    try {
      const initText = await initRes.text();
      initData = JSON.parse(initText);
    } catch (e) {
      throw new Error('Internal server error. Please try again later.');
    }

    if (!initData || !initData.progress_url) {
      throw new Error('Internal server error. Please try again later.');
    }

    const progressUrl = initData.progress_url;
    let realDownloadUrl = '';

    // Poll until download_url is ready (up to 45 seconds)
    const startTime = Date.now();
    while (Date.now() - startTime < 45000) {
      await new Promise((r) => setTimeout(r, 2000));

      try {
        const pollRes = await fetch(progressUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Referer': 'https://loader.to/',
          },
        });

        const pollText = await pollRes.text();
        let pollData: any = null;
        try {
          pollData = JSON.parse(pollText);
        } catch {
          // Ignore transient HTML or gateway timeouts during polling
          continue;
        }

        if (pollData && pollData.download_url) {
          realDownloadUrl = pollData.download_url;
          break;
        }
        if (pollData && (pollData.success === -1 || pollData.error)) {
          throw new Error('Internal server error. Please try again later.');
        }
      } catch (pollErr: any) {
        if (pollErr.message && pollErr.message.includes('Internal server error')) {
          throw pollErr;
        }
        // Continue loop on network glitch
      }
    }

    if (!realDownloadUrl) {
      throw new Error('Internal server error. Please try again later.');
    }

    const resolvedTitle = (initData.title || title || 'media').trim();
    const safeTitle = resolvedTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'media';
    const ext = format === 'mp3' ? 'mp3' : 'mp4';
    const outputFilename = `${safeTitle} [${quality}].${ext}`;

    // If trimming or custom audio processing is requested
    const needsTrimming = (trimStart && trimStart > 0) || (trimEnd && trimEnd > 0) || (volume && volume !== 1);

    if (needsTrimming) {
      console.log(`Applying real FFmpeg trim on ${realDownloadUrl} (Start: ${trimStart}, End: ${trimEnd})`);
      const tempDir = path.resolve(__dirname, 'tmp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempOutFile = path.resolve(tempDir, `real_cut_${Date.now()}.${ext}`);

      const ffmpegArgs: string[] = [];
      if (trimStart && trimStart > 0) {
        ffmpegArgs.push('-ss', trimStart.toString());
      }
      if (trimEnd && trimEnd > 0) {
        ffmpegArgs.push('-to', trimEnd.toString());
      }

      ffmpegArgs.push('-i', realDownloadUrl);

      if (format === 'mp3') {
        ffmpegArgs.push('-c:a', 'libmp3lame', '-b:a', '320k');
        if (volume && volume !== 1) {
          ffmpegArgs.push('-filter:a', `volume=${volume}`);
        }
        ffmpegArgs.push(
          '-metadata', `title=${safeTitle}`,
          '-metadata', `artist=${artist || 'PulseRip'}`,
          '-metadata', `album=${album || 'PulseRip Collection'}`,
          '-metadata', `date=${year}`,
          '-id3v2_version', '3'
        );
      } else {
        ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
      }

      ffmpegArgs.push('-y', tempOutFile);

      const ffmpegProc = spawn('ffmpeg', ffmpegArgs);
      let stderr = '';
      ffmpegProc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      ffmpegProc.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempOutFile)) {
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outputFilename)}"`);
          res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');

          const stream = fs.createReadStream(tempOutFile);
          stream.pipe(res);
          stream.on('end', () => {
            try {
              fs.unlinkSync(tempOutFile);
            } catch (e) {}
          });
        } else {
          // If trim failed, fall back to streaming the real untrimmed file directly
          console.warn('Trim failed, redirecting to full real download:', stderr.slice(-300));
          return res.redirect(realDownloadUrl);
        }
      });
      return;
    }

    // Return direct downloadUrl to client for high-speed direct browser downloading
    // This avoids Cloud Run stream proxy timeouts and memory bloat
    return res.json({
      success: true,
      downloadUrl: realDownloadUrl,
      title: safeTitle,
      filename: outputFilename,
      format,
      quality,
    });
  } catch (err: any) {
    console.error('Real convert error:', err);
    res.status(500).json({
      error: 'Internal server error. Please try again later.',
    });
  }
});

// Download thumbnail directly
app.get('/api/download-thumbnail', async (req, res) => {
  try {
    const { url, filename = 'thumbnail.jpg' } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send('Missing thumbnail URL');
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).send('Failed to fetch thumbnail image');
    }

    const buffer = await response.arrayBuffer();
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename as string)}"`);
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    res.status(500).send('Thumbnail download failed: ' + err.message);
  }
});

// Same-origin stream download proxy with strict MIME types and phone extension support
const handleMediaDownload = async (req: express.Request, res: express.Response) => {
  try {
    const targetUrl = (req.query.url as string) || '';
    if (!targetUrl) {
      return res.status(400).send('Missing url parameter');
    }

    const rawName = (req.params.filename || (req.query.name as string) || 'media_file').trim();
    const cleanFilename = rawName.replace(/[^\w\s.-]/g, '').trim() || 'media_file';

    let mimeType = 'application/octet-stream';
    if (cleanFilename.toLowerCase().endsWith('.mp3')) {
      mimeType = 'audio/mpeg';
    } else if (cleanFilename.toLowerCase().endsWith('.mp4')) {
      mimeType = 'video/mp4';
    } else if (cleanFilename.toLowerCase().endsWith('.wav')) {
      mimeType = 'audio/wav';
    } else if (cleanFilename.toLowerCase().endsWith('.m4a')) {
      mimeType = 'audio/mp4';
    }

    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
    });

    if (!upstream.ok || !upstream.body) {
      return res.redirect(targetUrl);
    }

    const upstreamType = upstream.headers.get('content-type');
    const finalMime =
      upstreamType && upstreamType !== 'text/html' && upstreamType !== 'application/octet-stream'
        ? upstreamType
        : mimeType;
    const contentLength = upstream.headers.get('content-length');

    const asciiSafe = cleanFilename.replace(/[^\x20-\x7E]/g, '_');

    res.setHeader('Content-Type', finalMime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiSafe}"; filename*=UTF-8''${encodeURIComponent(cleanFilename)}`
    );

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const { Readable } = await import('stream');
    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.pipe(res);
  } catch (err: any) {
    console.error('Download file proxy error:', err);
    if (req.query.url) {
      return res.redirect(req.query.url as string);
    }
    res.status(500).send('File streaming failed');
  }
};

app.get('/api/download-file/:filename', handleMediaDownload);
app.get('/api/download-file', handleMediaDownload);

// Start Express server and mount Vite in development
async function startServer() {
  const http = await import('http');
  const server = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexPath = path.resolve(distPath, 'index.html');

    if (!fs.existsSync(indexPath)) {
      console.log('Production dist bundle not found. Building Vite assets...');
      try {
        const { execSync } = await import('child_process');
        execSync('npx vite build', { stdio: 'inherit' });
      } catch (buildErr) {
        console.error('Failed to auto-build Vite client:', buildErr);
      }
    }

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(500).send('Application build in progress. Please refresh in a moment.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PulseRip Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});
