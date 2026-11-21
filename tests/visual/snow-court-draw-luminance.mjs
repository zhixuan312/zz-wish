// Browser-side capture helper. It reads the final displayed drawing buffer
// before it is presented or the HTML overlay is composited.
export function createSnowCourtDrawLuminance(THREE, renderer) {
  const width = 48, height = 36;
  const pixels = new Uint8Array(width * height * 4);
  const gl = renderer.getContext();
  const describe = (method, extra = {}) => ({ method, width, height, ...extra });
  const mean = bytes => {
    let luminance = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      luminance += .2126 * bytes[i] + .7152 * bytes[i + 1] + .0722 * bytes[i + 2];
    }
    return luminance / (width * height);
  };
  if (!renderer.capabilities.isWebGL2) {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    return {
      capture(frame) {
        context.drawImage(renderer.domElement, 0, 0, width, height);
        frame.luminance = mean(context.getImageData(0, 0, width, height).data);
      },
      finish: () => describe('Immediate pre-UI canvas copy'),
    };
  }

  const free = [];
  const pending = [];
  const origin = new THREE.Vector2(0, 0);
  const multisampled = gl.getParameter(gl.SAMPLES) > 0;
  const sampleFramebuffer = gl.createFramebuffer();
  const sampleColor = gl.createRenderbuffer();
  const sourceFramebuffer = multisampled ? gl.createFramebuffer() : null;
  const sampleLimit = 64;
  let source;
  let submitted = 0, maximumPending = 0;
  const release = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    for (const { buffer, fence } of pending) {
      gl.deleteSync(fence);
      gl.deleteBuffer(buffer);
    }
    for (const buffer of free) gl.deleteBuffer(buffer);
    gl.deleteFramebuffer(sampleFramebuffer);
    gl.deleteFramebuffer(sourceFramebuffer);
    gl.deleteRenderbuffer(sampleColor);
    source?.dispose();
  };
  const readyFramebuffer = target => {
    if (gl.checkFramebufferStatus(target) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Snow Court draw-luminance framebuffer is incomplete.');
    }
  };
  const checkErrors = () => {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error('Snow Court draw-luminance WebGL error ' + error);
  };

  const initialRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);
  try {
    gl.bindRenderbuffer(gl.RENDERBUFFER, sampleColor);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampleFramebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, sampleColor);
    readyFramebuffer(gl.FRAMEBUFFER);
  } catch (error) {
    release();
    throw error;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, initialRenderbuffer);
  }

  function drain() {
    try {
      while (pending.length) {
        const { buffer, fence, frame } = pending[0];
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.TIMEOUT_EXPIRED) break;
        if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) {
          throw new Error('Snow Court draw-luminance GPU fence failed.');
        }
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
        frame.luminance = mean(pixels);
        gl.deleteSync(fence);
        pending.shift();
        free.push(buffer);
      }
    } finally {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }
  }

  return {
    capture(frame) {
      if (renderer.getRenderTarget() !== null || renderer.getScissorTest() || gl.isContextLost()) {
        throw new Error('Snow Court draw luminance requires the full live default framebuffer.');
      }
      drain();
      if (pending.length >= sampleLimit) throw new Error('Snow Court draw-luminance PBO queue did not drain.');
      const sourceWidth = gl.drawingBufferWidth, sourceHeight = gl.drawingBufferHeight;
      let buffer, fence;
      try {
        if (multisampled) {
          const resized = source?.image.width !== sourceWidth || source.image.height !== sourceHeight;
          if (resized) {
            source?.dispose();
            source = new THREE.FramebufferTexture(sourceWidth, sourceHeight);
          }
          // The default framebuffer copy performs the MSAA resolve without
          // scaling. The single-sample copy can then use a filtered blit.
          renderer.copyFramebufferToTexture(origin, source);
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sourceFramebuffer);
          if (resized) {
            const texture = renderer.properties.get(source).__webglTexture;
            gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            readyFramebuffer(gl.READ_FRAMEBUFFER);
          }
        }
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sampleFramebuffer);
        gl.blitFramebuffer(0, 0, sourceWidth, sourceHeight, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sampleFramebuffer);
        buffer = free.pop();
        if (!buffer) {
          buffer = gl.createBuffer();
          gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
          gl.bufferData(gl.PIXEL_PACK_BUFFER, pixels.byteLength, gl.STREAM_READ);
        } else gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!fence) throw new Error('Snow Court draw-luminance GPU fence was not allocated.');
        if (!submitted++) checkErrors();
        pending.push({ buffer, fence, frame });
        maximumPending = Math.max(maximumPending, pending.length);
        gl.flush();
      } catch (error) {
        if (fence) gl.deleteSync(fence);
        if (buffer) gl.deleteBuffer(buffer);
        throw error;
      } finally {
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
    },
    async finish() {
      try {
        const deadline = performance.now() + 5000;
        while (pending.length) {
          drain();
          if (!pending.length) break;
          if (performance.now() >= deadline) throw new Error('Snow Court draw-luminance GPU readback timed out.');
          await new Promise(resolve => setTimeout(resolve, 8));
        }
        checkErrors();
        return describe('Default framebuffer filtered blit and asynchronous PBO readback',
          { multisampled, submitted, maximumPending });
      } finally {
        release();
      }
    },
  };
}
