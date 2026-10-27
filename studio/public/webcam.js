(() => {
  const form = document.getElementById('chatForm');
  const tools = document.createElement('div');
  tools.className = 'webcam-tools';
  tools.innerHTML = `<button type="button" id="webcamToggle" data-on="false">開啟攝影機</button>
    <button type="button" id="webcamPreview" hidden>預覽與設定</button>
    <label title="開啟後，AI 會先判斷問題是否需要目前畫面"><input type="checkbox" id="webcamAuto" checked>自動判斷</label>
    <label title="只影響下一次送出"><input type="checkbox" id="webcamOnce">這次附上畫面</label>
    <span class="webcam-status" id="webcamStatus" role="status">攝影機未開啟 · 不附畫面</span>`;
  form.before(tools);
  const panel = document.createElement('section');
  panel.className = 'webcam-popover';
  panel.hidden = true;
  panel.setAttribute('aria-label', '攝影機預覽與設定');
  panel.innerHTML = `<header><span>攝影機預覽</span><button type="button" id="webcamHide">收起</button></header>
    <video id="webcamVideo" autoplay muted playsinline></video>
    <p><span class="webcam-light" id="webcamLight">尚未開啟</span></p>
    <label class="webcam-device">攝影機<select id="webcamDevice" aria-label="選擇攝影機"><option value="">預設攝影機</option></select></label>
    <label class="webcam-model">視覺模型<select id="webcamModel" aria-label="視覺模型"><option value="">載入中…</option></select></label>
    <p>預覽只在你的瀏覽器顯示。提問需要畫面時才拍一張，送到本機 llama.cpp；只保存問題與回答，不保存照片。收起預覽不會關閉攝影機。</p>
    <div class="webcam-shot" id="webcamShot" hidden><small id="webcamShotLabel">這次分析的照片</small><img id="webcamShotImage" alt="最近一次送到本機模型的攝影機照片"></div>`;
  document.body.append(panel);
  const $ = id => document.getElementById(id);
  const video = $('webcamVideo');
  let stream = null;
  let opening = false;
  let busy = false;
  let generation = 0;
  let shotUrl = null;
  let turnVersion = 0;

  async function api(url, options) {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || data.detail || '操作失敗');
    return data;
  }
  function live() { return Boolean(stream?.getVideoTracks().some(track => track.readyState === 'live')); }
  function status(text) { $('webcamStatus').textContent = text; }
  function clearShot() {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = null;
    $('webcamShotImage').removeAttribute('src');
    $('webcamShot').hidden = true;
  }
  function stopCamera() {
    generation += 1;
    if (stream) for (const track of stream.getTracks()) track.stop();
    stream = null;
    video.srcObject = null;
    $('webcamToggle').textContent = '開啟攝影機';
    $('webcamToggle').dataset.on = 'false';
    $('webcamPreview').hidden = true;
    $('webcamOnce').checked = false;
    $('webcamLight').textContent = '攝影機已關閉';
    panel.hidden = true;
    clearShot();
    status('攝影機已關閉 · 不附畫面');
    window.dispatchEvent(new Event('chat-camera-stopped'));
  }
  async function loadModels() {
    const previous = $('webcamModel').value;
    try {
      const data = await api('/api/webcam/models');
      $('webcamModel').replaceChildren();
      for (const model of data.models) $('webcamModel').add(new Option(model.name, model.name));
      if (!data.models.length) $('webcamModel').add(new Option('沒有支援圖片的本機模型', ''));
      const preferred = data.models.find(model => model.name === previous) ||
        data.models.find(model => model.name === document.getElementById('model').value) ||
        data.models.find(model => model.name.startsWith('qwen2.5vl:3b')) ||
        data.models.find(model => model.name === 'llava:latest');
      if (preferred) $('webcamModel').value = preferred.name;
    } catch (error) {
      $('webcamModel').replaceChildren(new Option('視覺模型暫時無法載入', ''));
      status(error.message);
    }
  }
  async function startCamera(deviceId) {
    if (opening) return;
    if (!navigator.mediaDevices?.getUserMedia) throw Error('目前網址無法使用攝影機，請使用 localhost 或 HTTPS，並確認瀏覽器支援。');
    stopCamera();
    opening = true;
    const ticket = generation;
    $('webcamToggle').disabled = true;
    status('正在等待攝影機授權…');
    try {
      const next = await navigator.mediaDevices.getUserMedia({audio: false, video: {
        width: {ideal: 1280}, height: {ideal: 720}, ...(deviceId ? {deviceId: {exact: deviceId}} : {})
      }});
      if (ticket !== generation) { next.getTracks().forEach(track => track.stop()); return; }
      stream = next;
      for (const track of stream.getTracks()) track.onended = () => {
        if (stream === next) { stopCamera(); status('攝影機連線已中斷，請重新開啟。'); }
      };
      video.srcObject = stream;
      await video.play();
      $('webcamToggle').textContent = '關閉攝影機';
      $('webcamToggle').dataset.on = 'true';
      $('webcamPreview').hidden = false;
      $('webcamLight').textContent = '預覽中 · 尚未送出照片';
      panel.hidden = false;
      const selected = stream.getVideoTracks()[0].getSettings().deviceId;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      $('webcamDevice').replaceChildren(new Option('預設攝影機', ''));
      devices.forEach((device, index) => $('webcamDevice').add(new Option(device.label || `攝影機 ${index + 1}`, device.deviceId)));
      if (selected) $('webcamDevice').value = selected;
      status('預覽中 · 只有需要畫面時才拍一張');
      await loadModels();
    } catch (error) {
      stopCamera();
      throw Error(error.name === 'NotAllowedError' ? '攝影機未獲授權。可在網址列的相機權限設定後重試。' : error.message);
    } finally {
      opening = false;
      $('webcamToggle').disabled = false;
    }
  }
  async function captureFrame() {
    if (!live() || video.readyState < 2 || !video.videoWidth) throw Error('攝影機尚未準備好，請稍候再試。');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size > 2 * 1024 * 1024) throw Error('這張照片無法處理，請重試。');
    return new File([blob], 'webcam-snapshot.jpg', {type: 'image/jpeg'});
  }

  $('webcamToggle').onclick = async () => {
    try { if (live()) stopCamera(); else await startCamera($('webcamDevice').value); }
    catch (error) { status(error.message); }
  };
  $('webcamPreview').onclick = () => { panel.hidden = !panel.hidden; };
  $('webcamHide').onclick = () => { panel.hidden = true; };
  $('webcamDevice').onchange = async () => {
    if (live() && !busy) { try { await startCamera($('webcamDevice').value); } catch (error) { status(error.message); } }
  };
  $('webcamOnce').onchange = () => {
    if ($('webcamOnce').checked) status('下次送出會附一張攝影機照片');
  };
  window.addEventListener('pagehide', stopCamera);
  document.getElementById('refreshModelsBtn').addEventListener('click', loadModels);
  window.chatCamera = {
    live, stop:stopCamera,
    async acquireStream(){
      if(opening)throw Error('攝影機正在啟動，請稍候再試');
      if(!live())await startCamera($('webcamDevice').value);
      if(!live())throw Error('攝影機已關閉');
      return stream;
    },
    getStream(){return stream;},

    async prepareTurn({text, model, hasAttachment}) {
      turnVersion += 1;
      if (hasAttachment) {
        if ($('webcamOnce').checked) throw Error('這次已有附件，請先移除附件再附上攝影機畫面。');
        status('這次使用附件 · 未擷取攝影機');
        return null;
      }
      const force = $('webcamOnce').checked;
      if (force && !live()) throw Error('請先按「開啟攝影機」，再附上畫面。');
      if (!live() || (!force && !$('webcamAuto').checked)) {
        status('這次為純文字聊天 · 未擷取攝影機');
        return null;
      }
      const ticket = generation;
      if (!force) {
        status('AI 正在判斷問題是否需要目前畫面…');
        const route = await api('/api/webcam/route', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, model})});
        if (!route.camera) { status('這次為純文字聊天 · 未擷取攝影機'); return null; }
      }
      if (ticket !== generation || !live()) throw Error('攝影機已關閉或切換，這次沒有拍照；請重試。');
      const visionModel = $('webcamModel').value;
      if (!visionModel) throw Error('沒有可用的視覺模型，請先安裝支援圖片的 llama.cpp 模型。');
      const file = await captureFrame();
      if (ticket !== generation || !live()) throw Error('攝影機已關閉，這次照片未送出。');
      clearShot();
      shotUrl = URL.createObjectURL(file);
      $('webcamShotImage').src = shotUrl;
      $('webcamShot').hidden = false;
      $('webcamShotLabel').textContent = '這次送出的照片 · ' + new Date().toLocaleTimeString('zh-TW');
      $('webcamLight').textContent = '剛擷取一張 · 正在本機分析';
      $('webcamOnce').checked = false;
      status('已擷取一張照片 · 本機視覺模型分析中…');
      return {file, visionModel, version: turnVersion};
    },
    setBusy(value) {
      busy = value;
      $('webcamAuto').disabled = value;
      $('webcamOnce').disabled = value;
      $('webcamDevice').disabled = value;
      $('webcamModel').disabled = value;
    },
    complete(answer, version) {
      if (version !== turnVersion) return;
      status(`單張分析完成 · ${answer.visionModel} · ${(answer.elapsedMs / 1000).toFixed(1)} 秒 · 照片未儲存`);
      if (live()) $('webcamLight').textContent = '預覽中 · 分析已完成';
    },
    failed() { status('這次請求未完成，請重試 · 不會自動重拍'); },
    reset() { turnVersion += 1; clearShot(); $('webcamOnce').checked = false; }
  };
  loadModels();
})();
