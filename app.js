(() => {
  const $ = (id) => document.getElementById(id);
  const audio = $('audio');
  const state = { tracks: [], current: -1, filter: 'all', shuffle: false, repeat: false, objectUrls: new Map() };
  const savedVolume = Number(localStorage.getItem('pulse-volume'));
  audio.volume = Number.isFinite(savedVolume) && savedVolume >= 0 ? savedVolume : 0.8;
  $('volume').value = audio.volume;
  updateVolumeLabel();

  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function time(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return m + ':' + String(s).padStart(2, '0');
  }
  function currentTrack() { return state.tracks[state.current] || null; }
  function updateVolumeLabel() { $('volumeLabel').textContent = Math.round(audio.volume * 100) + '%'; }
  function renderList() {
    const query = $('search').value.trim().toLowerCase();
    const filtered = state.tracks.map((track, index) => ({track,index})).filter(({track}) =>
      (state.filter === 'all' || track.favorite) &&
      (track.title + ' ' + track.artist).toLowerCase().includes(query));
    $('trackCount').textContent = state.tracks.length + (state.tracks.length === 1 ? ' song' : ' songs');
    const list = $('trackList'); list.innerHTML = '';
    if (!filtered.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state';
      empty.innerHTML = '<span>♫</span><strong>' + (state.tracks.length ? 'Nothing found' : 'Your library is empty') + '</strong><p>' + (state.tracks.length ? 'Try another search or switch filters.' : 'Import audio files from your phone to get started.') + '</p>';
      if (!state.tracks.length) { const button = document.createElement('button'); button.className = 'soft-button'; button.textContent = '＋ Add music'; button.onclick = openPicker; empty.append(button); }
      list.append(empty); return;
    }
    filtered.forEach(({track,index}) => {
      const row = document.createElement('div'); row.className = 'track-row' + (index === state.current ? ' current' : '');
      const art = document.createElement('div'); art.className = 'mini-art';
      if (track.cover) { const img = document.createElement('img'); img.src = track.cover; img.alt = ''; art.append(img); } else art.textContent = '♫';
      const copy = document.createElement('div'); copy.className = 'row-copy';
      const title = document.createElement('strong'); title.textContent = track.title;
      const artist = document.createElement('span'); artist.textContent = track.artist;
      copy.append(title,artist);
      const duration = document.createElement('span'); duration.className = 'row-duration'; duration.textContent = time(track.duration);
      row.append(art,copy,duration); row.onclick = () => loadTrack(index,true); list.append(row);
    });
  }
  function setMood(track) {
    if (!track || !track.cover) { document.documentElement.style.setProperty('--mood1','#7652bc'); document.documentElement.style.setProperty('--mood2','#d36c91'); return; }
    try {
      const img = new Image(); img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,1,1);
        const data = ctx.getImageData(0,0,1,1).data;
        const color = 'rgb(' + data[0] + ',' + data[1] + ',' + data[2] + ')';
        document.documentElement.style.setProperty('--mood1',color);
        document.documentElement.style.setProperty('--mood2','hsl(' + ((data[0]*.7+data[1]*.2+data[2]*.1)%360) + ',65%,48%)');
      }; img.src = track.cover;
    } catch (_) { /* Some image formats may block canvas sampling. */ }
  }
  function loadTrack(index, autoplay) {
    const track = state.tracks[index]; if (!track) return;
    state.current = index; audio.src = track.url; $('trackTitle').textContent = track.title;
    $('trackArtist').textContent = track.artist; $('formatInfo').textContent = track.type || 'Audio';
    $('fileInfo').textContent = track.name; $('addedInfo').textContent = track.added;
    $('favoriteButton').textContent = track.favorite ? '♥' : '♡';
    $('favoriteButton').classList.toggle('active',track.favorite);
    const art = $('artwork'); art.innerHTML = '';
    if (track.cover) { const img = document.createElement('img'); img.src = track.cover; img.alt = 'Album artwork'; art.append(img); }
    else { const mark = document.createElement('div'); mark.className = 'artwork-placeholder'; mark.textContent = '♫'; art.append(mark); }
    setMood(track); $('lyricsText').textContent = 'Lyrics for this track are not available yet.';
    renderList(); updateMediaSession(track);
    if (autoplay) play();
  }
  function play() {
    if (!currentTrack()) { toast('Import a song first.'); return; }
    audio.play().then(() => { $('playButton').textContent = 'Ⅱ'; document.body.classList.add('is-playing'); }).catch(() => toast('Could not play this audio file.'));
  }
  function pause() { audio.pause(); $('playButton').textContent = '▶'; document.body.classList.remove('is-playing'); }
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({title:track.title,artist:track.artist,album:'Pulse Library'});
      navigator.mediaSession.setActionHandler('play',play);
      navigator.mediaSession.setActionHandler('pause',pause);
      navigator.mediaSession.setActionHandler('previoustrack',previous);
      navigator.mediaSession.setActionHandler('nexttrack',next);
      navigator.mediaSession.setActionHandler('seekto', (details) => { if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime; });
    } catch (_) {}
  }
  function next() {
    if (!state.tracks.length) return;
    let index = state.current;
    if (state.shuffle && state.tracks.length > 1) { do { index = Math.floor(Math.random()*state.tracks.length); } while (index === state.current); }
    else index = (index + 1) % state.tracks.length;
    loadTrack(index,true);
  }
  function previous() {
    if (!state.tracks.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    loadTrack((state.current - 1 + state.tracks.length) % state.tracks.length,true);
  }
  function openPicker() { $('fileInput').click(); }
  function addFiles(files) {
    const incoming = Array.from(files).filter(file => file.type.startsWith('audio/'));
    if (!incoming.length) { toast('Choose audio files to import.'); return; }
    incoming.forEach(file => {
      const url = URL.createObjectURL(file); state.objectUrls.set(file.name + file.size,url);
      const title = file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
      state.tracks.push({name:file.name,title,artist:'Unknown artist',type:file.type || 'Audio',url,cover:null,duration:0,favorite:false,added:new Date().toLocaleDateString()});
    });
    renderList(); toast('Added ' + incoming.length + (incoming.length === 1 ? ' song.' : ' songs.'));
    if (state.current < 0) loadTrack(0,false);
  }
  $('importButton').onclick = openPicker; $('emptyImport').onclick = openPicker;
  $('fileInput').addEventListener('change',event => { addFiles(event.target.files); event.target.value = ''; });
  $('playButton').onclick = () => audio.paused ? play() : pause();
  $('nextButton').onclick = next; $('previousButton').onclick = previous;
  $('shuffleButton').onclick = () => { state.shuffle = !state.shuffle; $('shuffleButton').classList.toggle('selected',state.shuffle); toast(state.shuffle ? 'Shuffle on' : 'Shuffle off'); };
  $('repeatButton').onclick = () => { state.repeat = !state.repeat; audio.loop = state.repeat; $('repeatButton').classList.toggle('selected',state.repeat); toast(state.repeat ? 'Repeat on' : 'Repeat off'); };
  $('favoriteButton').onclick = () => { const track = currentTrack(); if (!track) return; track.favorite = !track.favorite; $('favoriteButton').textContent = track.favorite ? '♥' : '♡'; $('favoriteButton').classList.toggle('active',track.favorite); renderList(); };
  $('volume').addEventListener('input',event => { audio.volume = Number(event.target.value); localStorage.setItem('pulse-volume',audio.volume); updateVolumeLabel(); });
  $('seek').addEventListener('input',event => { if (Number.isFinite(audio.duration)) audio.currentTime = (Number(event.target.value)/1000)*audio.duration; });
  audio.addEventListener('timeupdate',() => { if (Number.isFinite(audio.duration) && audio.duration > 0) $('seek').value = String(Math.round(audio.currentTime/audio.duration*1000)); $('currentTime').textContent = time(audio.currentTime); });
  audio.addEventListener('loadedmetadata',() => { $('duration').textContent = time(audio.duration); const track = currentTrack(); if (track) { track.duration = audio.duration; renderList(); } });
  audio.addEventListener('ended',() => { if (!state.repeat) next(); });
  audio.addEventListener('error',() => { if (currentTrack()) toast('This file could not be played.'); });
  $('search').addEventListener('input',renderList);
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click',() => { state.filter = tab.dataset.filter; document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active',t===tab)); renderList(); }));
  document.addEventListener('keydown',event => { if (event.target.matches('input')) return; if (event.code === 'Space') { event.preventDefault(); audio.paused ? play() : pause(); } });
  window.addEventListener('beforeunload',() => state.objectUrls.forEach(url => URL.revokeObjectURL(url)));
  renderList();
})();