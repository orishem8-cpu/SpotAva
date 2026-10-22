/* ==========================================================
   Музыкальный веб-плеер — логика (чистый Vanilla JS)
   ========================================================== */

(() => {
  'use strict';

  /* ---------- Ссылки на элементы страницы ---------- */
  const $ = (id) => document.getElementById(id);

  const audio       = $('audio');
  const elPlaylists = $('playlists');
  const elStations  = $('stations');
  const elTracks    = $('tracks');
  const elTitleList = $('tracks-title');
  const elStatus    = $('status');
  const elGreeting  = $('greeting');

  const btnPlay    = $('btn-play');
  const btnPrev    = $('btn-prev');
  const btnNext    = $('btn-next');
  const btnShuffle = $('btn-shuffle');
  const btnRepeat  = $('btn-repeat');
  const btnMute    = $('btn-mute');
  const playIcon   = $('play-icon');
  const volIcon    = $('vol-icon');

  const progress     = $('progress');
  const progressFill = $('progress-fill');
  const volume       = $('volume');
  const volumeFill   = $('volume-fill');
  const timeCurrent  = $('time-current');
  const timeTotal    = $('time-total');

  /* ---------- Состояние приложения ---------- */
  const state = {
    tracks: [],        // все треки из tracks.json
    queue: [],         // текущая очередь (выбранный плейлист/станция)
    current: -1,       // индекс текущего трека в очереди
    playlistId: 'all', // активный плейлист
    shuffle: false,    // режим перемешивания
    repeat: 'off',     // 'off' | 'all' | 'one'
    lastVolume: 0.8    // громкость до отключения звука
  };

  /* ==========================================================
     Вспомогательные функции
     ========================================================== */

  // Форматирует секунды в вид м:сс
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Генерирует градиент-заглушку для обложки по id трека
  function gradientFor(seed) {
    const hue = (Number(seed) * 67) % 360;
    return `linear-gradient(135deg, hsl(${hue}, 55%, 38%), hsl(${(hue + 50) % 360}, 60%, 22%))`;
  }

  // Ставит обложку в контейнер .cover: картинка + градиент как запасной вариант
  function setCover(container, track) {
    const img = container.querySelector('img');
    container.style.background = gradientFor(track ? track.id : 0);
    if (!img) return;
    if (track && track.cover) {
      img.style.display = '';
      img.onerror = () => { img.style.display = 'none'; }; // нет файла — виден градиент
      img.src = track.cover;
    } else {
      img.style.display = 'none';
    }
  }

  // Создаёт DOM-элемент обложки (для карточек и списков)
  function createCover(track, className) {
    const wrap = document.createElement('div');
    wrap.className = `cover ${className || ''}`.trim();
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    wrap.appendChild(img);
    setCover(wrap, track);
    return wrap;
  }

  // Приветствие по времени суток
  function setGreeting() {
    const h = new Date().getHours();
    let text = 'Добрый день';
    if (h >= 5 && h < 12) text = 'Доброе утро';
    else if (h >= 18 && h < 23) text = 'Добрый вечер';
    else if (h >= 23 || h < 5) text = 'Доброй ночи';
    elGreeting.textContent = text;
  }

  /* ==========================================================
     Загрузка данных
     ========================================================== */

  async function loadTracks() {
    try {
      // Относительный путь (без ведущего «/») — работает в подпапке GitHub Pages
      const response = await fetch('tracks.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('tracks.json должен быть массивом');
      state.tracks = data;
    } catch (err) {
      console.error('Не удалось загрузить tracks.json:', err);
      elStatus.textContent =
        'Не удалось загрузить tracks.json. Если вы открыли index.html двойным кликом, ' +
        'запустите локальный сервер (python -m http.server).';
      return;
    }

    state.queue = [...state.tracks];
    renderPlaylists();
    renderStations();
    renderTracks();
  }

  /* ==========================================================
     Плейлисты
     ========================================================== */

  // Плейлисты строим автоматически: «Все треки» + по одному на исполнителя
  function buildPlaylists() {
    const lists = [{ id: 'all', name: 'Все треки', tracks: state.tracks }];
    const byArtist = new Map();
    state.tracks.forEach((t) => {
      if (!byArtist.has(t.artist)) byArtist.set(t.artist, []);
      byArtist.get(t.artist).push(t);
    });
    byArtist.forEach((tracks, artist) => {
      lists.push({ id: `artist:${artist}`, name: artist, tracks });
    });
    return lists;
  }

  function getPlaylistTracks(id) {
    const list = buildPlaylists().find((p) => p.id === id);
    return list ? list.tracks : state.tracks;
  }

  function renderPlaylists() {
    elPlaylists.innerHTML = '';
    buildPlaylists().forEach((pl) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'playlist-item' + (pl.id === state.playlistId ? ' active' : '');
      btn.type = 'button';

      // Квадратик-обложка плейлиста (по первому треку)
      const cover = document.createElement('div');
      cover.className = 'playlist-cover';
      cover.style.background = gradientFor(pl.tracks[0] ? pl.tracks[0].id : 0);
      cover.innerHTML = '<svg class="icon"><use href="#i-note"/></svg>';

      const info = document.createElement('div');
      info.innerHTML =
        `<div class="playlist-name"></div>` +
        `<div class="playlist-meta">Плейлист • ${pl.tracks.length} тр.</div>`;
      info.querySelector('.playlist-name').textContent = pl.name;

      btn.append(cover, info);
      btn.addEventListener('click', () => openPlaylist(pl.id, pl.name));
      li.appendChild(btn);
      elPlaylists.appendChild(li);
    });
  }

  // Открыть плейлист: показать его треки в центральной колонке
  function openPlaylist(id, name) {
    state.playlistId = id;
    elTitleList.textContent = name || 'Все треки';
    renderPlaylists();
    renderTracks(getPlaylistTracks(id));
  }

  /* ==========================================================
     Рекомендуемые станции и карточки треков
     ========================================================== */

  // Станции — по одной на исполнителя; клик запускает все его треки
  function renderStations() {
    elStations.innerHTML = '';
    buildPlaylists().slice(1, 7).forEach((pl) => {
      const btn = document.createElement('button');
      btn.className = 'station';
      btn.type = 'button';
      btn.appendChild(createCover(pl.tracks[0]));
      const name = document.createElement('span');
      name.className = 'station-name';
      name.textContent = `Радио: ${pl.name}`;
      btn.appendChild(name);
      btn.addEventListener('click', () => {
        state.playlistId = pl.id;
        elTitleList.textContent = pl.name;
        renderPlaylists();
        renderTracks(pl.tracks);
        playFromList(pl.tracks, 0);
      });
      elStations.appendChild(btn);
    });
  }

  // Карточки треков
  function renderTracks(list = state.tracks) {
    elTracks.innerHTML = '';
    elStatus.textContent = list.length ? '' : 'Пока нет треков. Добавьте их в tracks.json.';

    list.forEach((track, i) => {
      const card = document.createElement('button');
      card.className = 'card';
      card.type = 'button';
      card.dataset.id = track.id;

      card.appendChild(createCover(track));

      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = track.title;

      const artist = document.createElement('div');
      artist.className = 'card-artist';
      artist.textContent = track.artist;

      const play = document.createElement('span');
      play.className = 'card-play';
      play.innerHTML = '<svg class="icon"><use href="#i-play"/></svg>';

      card.append(title, artist, play);
      card.addEventListener('click', () => {
        // Клик по уже играющей карточке — пауза/продолжить
        const cur = state.queue[state.current];
        if (cur && cur.id === track.id) togglePlay();
        else playFromList(list, i);
      });
      elTracks.appendChild(card);
    });
    highlightCurrent();
  }

  // Подсвечивает карточку играющего трека
  function highlightCurrent() {
    const cur = state.queue[state.current];
    document.querySelectorAll('.card').forEach((c) => {
      c.classList.toggle('playing', !!cur && Number(c.dataset.id) === Number(cur.id));
    });
  }

  /* ==========================================================
     Управление воспроизведением
     ========================================================== */

  // Запустить трек с индексом i из списка list (список становится очередью)
  function playFromList(list, i) {
    state.queue = [...list];
    loadAndPlay(i);
  }

  // Загрузить трек из очереди и воспроизвести
  function loadAndPlay(index) {
    const track = state.queue[index];
    if (!track) return;
    state.current = index;

    audio.src = track.src; // например "music/song1.mp3" (относительный путь)
    audio.play().catch((err) => {
      // Например, MP3-файл не найден или браузер заблокировал автозапуск
      console.warn('Не удалось воспроизвести:', track.src, err);
    });

    updateNowPlaying(track);
    highlightCurrent();
  }

  // Синхронизация правой колонки, нижнего плеера и заголовка вкладки
  function updateNowPlaying(track) {
    $('np-title').textContent = track.title;
    $('np-artist').textContent = track.artist;
    $('pl-title').textContent = track.title;
    $('pl-artist').textContent = track.artist;
    setCover($('np-cover'), track);
    setCover($('pl-cover'), track);
    document.title = `${track.title} • ${track.artist}`;

    // Системные медиа-кнопки / экран блокировки (если поддерживается)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        artwork: track.cover ? [{ src: track.cover }] : []
      });
    }
  }

  function togglePlay() {
    if (state.current === -1) {
      // Ничего не выбрано — запускаем первый трек
      if (state.queue.length) loadAndPlay(0);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  // Следующий трек (учитывает shuffle и repeat)
  function nextTrack(auto = false) {
    if (!state.queue.length) return;
    let idx;
    if (state.shuffle && state.queue.length > 1) {
      do { idx = Math.floor(Math.random() * state.queue.length); }
      while (idx === state.current);
    } else {
      idx = state.current + 1;
      if (idx >= state.queue.length) {
        // Конец очереди: при автопереходе без repeat — остановка
        if (auto && state.repeat === 'off') {
          audio.pause();
          audio.currentTime = 0;
          return;
        }
        idx = 0;
      }
    }
    loadAndPlay(idx);
  }

  // Предыдущий трек (если играет больше 3 секунд — начать текущий заново)
  function prevTrack() {
    if (!state.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const idx = state.current - 1 < 0 ? state.queue.length - 1 : state.current - 1;
    loadAndPlay(idx);
  }

  /* ==========================================================
     Слайдеры: перемотка и громкость
     ========================================================== */

  // Универсальный слайдер: клик и перетаскивание. Вызывает onChange(0..1)
  function setupSlider(el, onChange) {
    const ratioFromEvent = (e) => {
      const rect = el.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    };
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
      onChange(ratioFromEvent(e));
    });
    el.addEventListener('pointermove', (e) => { if (dragging) onChange(ratioFromEvent(e)); });
    const stop = () => { dragging = false; };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
  }

  function setFill(fillEl, ratio) {
    const pct = `${(ratio * 100).toFixed(2)}%`;
    fillEl.style.width = pct;
    fillEl.style.setProperty('--pos', pct);
  }

  // Перемотка по клику на прогресс-бар
  setupSlider(progress, (ratio) => {
    if (isFinite(audio.duration)) {
      audio.currentTime = ratio * audio.duration;
      setFill(progressFill, ratio);
    }
  });

  // Громкость по клику на полосу громкости
  setupSlider(volume, (ratio) => setVolume(ratio));

  function setVolume(value) {
    audio.volume = value;
    audio.muted = value === 0;
    if (value > 0) state.lastVolume = value;
    setFill(volumeFill, value);
    volIcon.setAttribute('href', value === 0 ? '#i-mute' : '#i-volume');
  }

  /* ==========================================================
     События аудио
     ========================================================== */

  audio.addEventListener('play',  () => playIcon.setAttribute('href', '#i-pause'));
  audio.addEventListener('pause', () => playIcon.setAttribute('href', '#i-play'));

  // Обновление прогресса и времени
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration;
    setFill(progressFill, isFinite(d) && d > 0 ? audio.currentTime / d : 0);
    timeCurrent.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener('loadedmetadata', () => {
    timeTotal.textContent = formatTime(audio.duration);
  });

  // Трек закончился — включаем следующий (или повторяем текущий)
  audio.addEventListener('ended', () => {
    if (state.repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      nextTrack(true);
    }
  });

  // Ошибка загрузки (нет файла) — сообщаем и пробуем следующий трек
  audio.addEventListener('error', () => {
    const track = state.queue[state.current];
    if (!track) return;
    elStatus.textContent = `Не найден файл: ${track.src}. Проверьте путь в tracks.json.`;
  });

  /* ==========================================================
     Кнопки управления
     ========================================================== */

  btnPlay.addEventListener('click', togglePlay);
  btnNext.addEventListener('click', () => nextTrack(false));
  btnPrev.addEventListener('click', prevTrack);

  btnShuffle.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    btnShuffle.classList.toggle('active', state.shuffle);
  });

  // Повтор: выкл → весь список → один трек
  btnRepeat.addEventListener('click', () => {
    state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
    btnRepeat.classList.toggle('active', state.repeat !== 'off');
    btnRepeat.title = { off: 'Повтор', all: 'Повтор списка', one: 'Повтор трека' }[state.repeat];
  });

  btnMute.addEventListener('click', () => {
    if (audio.volume > 0 && !audio.muted) setVolume(0);
    else setVolume(state.lastVolume || 0.8);
  });

  // Пробел — пауза/воспроизведение (если фокус не в поле ввода)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      togglePlay();
    }
  });

  // Системные медиа-кнопки
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', togglePlay);
    navigator.mediaSession.setActionHandler('pause', togglePlay);
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(false));
    navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
  }

  /* ==========================================================
     Запуск
     ========================================================== */

  setGreeting();
  setVolume(state.lastVolume);
  loadTracks();
})();
