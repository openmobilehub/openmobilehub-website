/**
 * LF YOUTUBE PLAYLIST — CLIENT-SIDE FETCH + RENDER + PAGINATION + MODAL
 *
 * READS data-* ATTRIBUTES FROM THE SKELETON DIV RENDERED BY PHP.
 * FETCHES ALL PLAYLIST VIDEOS FROM THE YOUTUBE DATA API v3 IN THE BROWSER
 * SO THE HTTP REFERER HEADER IS PRESENT AND API KEY RESTRICTIONS WORK.
 *
 * GRID:       USES lf-grid / lf-grid--3 FROM linux-foundation-components.css.
 * PAGINATION: MATCHES lf-pagination / paginate_links() HTML STRUCTURE.
 * CACHE:      2-HOUR LOCALSTORAGE CACHE KEYED BY PLAYLIST ID + CACHE BUST.
 */
(function () {
    'use strict';

    var CACHE_TTL = 2 * 60 * 60 * 1000; // 2 HOURS IN MILLISECONDS.
    var YT_API = 'https://www.googleapis.com/youtube/v3/';

    // ----------------------------------------------------------------
    // INIT
    // ----------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', function () {

        // REMOVE DUPLICATE MODALS IF SHORTCODE APPEARS MULTIPLE TIMES.
        var modals = document.querySelectorAll('.lf-ytp-modal');
        for (var m = 1; m < modals.length; m++) {
            modals[m].parentNode.removeChild(modals[m]);
        }

        // INIT EACH GRID.
        var grids = document.querySelectorAll('.lf-ytp[data-playlist-id]');
        grids.forEach(function (grid) {
            initGrid(grid);
        });

        initModal();
    });

    // ----------------------------------------------------------------
    // GRID INIT
    // ----------------------------------------------------------------

    function initGrid(grid) {
        var apiKey = grid.dataset.apiKey || '';
        var playlistId = grid.dataset.playlistId || '';
        var perPage = parseInt(grid.dataset.count, 10) || 9;
        var cacheBust = grid.dataset.cacheBust || '1';

        if (!apiKey || !playlistId) return;

        var cacheKey = 'lf_ytp_' + playlistId + '_' + cacheBust;
        var cached = getCache(cacheKey);

        if (cached) {
            renderGrid(grid, cached, perPage);
            return;
        }

        fetchAllVideos(apiKey, playlistId)
            .then(function (videos) {
                setCache(cacheKey, videos);
                renderGrid(grid, videos, perPage);
            })
            .catch(function (err) {
                grid.innerHTML = '<div class="lf-ytp-error"><strong>YouTube Playlist:</strong> ' + escHtml(err.message || 'Failed to load videos.') + '</div>';
            });
    }

    // ----------------------------------------------------------------
    // YOUTUBE API — FETCH ALL VIDEOS CHAINING nextPageToken
    // ----------------------------------------------------------------

    function fetchAllVideos(apiKey, playlistId) {
        var allItems = [];

        function fetchPage(pageToken) {
            var url = YT_API + 'playlistItems'
                + '?part=snippet'
                + '&playlistId=' + encodeURIComponent(playlistId)
                + '&maxResults=50'
                + '&key=' + encodeURIComponent(apiKey)
                + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');

            return fetch(url)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.error) {
                        throw new Error(data.error.message || 'YouTube API error.');
                    }
                    if (data.items) {
                        allItems = allItems.concat(data.items);
                    }
                    if (data.nextPageToken) {
                        return fetchPage(data.nextPageToken);
                    }
                    return allItems;
                });
        }

        return fetchPage(null).then(function (items) {
            if (!items.length) {
                throw new Error('No videos found in this playlist.');
            }

            // COLLECT ALL VIDEO IDS FOR STATISTICS CALL.
            var videoIds = items.map(function (item) {
                return (item.snippet.resourceId || {}).videoId || '';
            }).filter(Boolean);

            // FETCH STATS IN BATCHES OF 50.
            return fetchAllStats(apiKey, videoIds).then(function (statsById) {
                items.forEach(function (item) {
                    var vid = (item.snippet.resourceId || {}).videoId || '';
                    item.statistics = statsById[vid] || {};
                });
                return items;
            });
        });
    }

    function fetchAllStats(apiKey, videoIds) {
        var statsById = {};
        var batches = [];

        for (var i = 0; i < videoIds.length; i += 50) {
            batches.push(videoIds.slice(i, i + 50));
        }

        var promises = batches.map(function (batch) {
            var url = YT_API + 'videos'
                + '?part=statistics'
                + '&id=' + encodeURIComponent(batch.join(','))
                + '&key=' + encodeURIComponent(apiKey);

            return fetch(url)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (data.items) {
                        data.items.forEach(function (s) {
                            statsById[s.id] = s.statistics || {};
                        });
                    }
                });
        });

        return Promise.all(promises).then(function () { return statsById; });
    }

    // ----------------------------------------------------------------
    // RENDER GRID + PAGINATION
    // ----------------------------------------------------------------

    function renderGrid(grid, videos, perPage) {
        var total = videos.length;
        var totalPages = Math.ceil(total / perPage);
        var html = '';

        // GRID CARDS — ALL RENDERED, NON-PAGE-0 GET HIDDEN CLASS.
        html += '<div class="lf-grid lf-grid--3">';
        videos.forEach(function (item, index) {
            var cardPage = Math.floor(index / perPage);
            html += buildCard(item, index, cardPage);
        });
        html += '</div>';

        // PAGINATION.
        if (totalPages > 1) {
            html += '<div class="lf-pagination lf-ytp__pagination" data-total-pages="' + totalPages + '">';
            html += buildPaginationHtml(0, totalPages);
            html += '</div>';
        }

        grid.innerHTML = html;

        // STORE DATA ON GRID FOR PAGINATION HANDLER.
        grid.dataset.totalPages = totalPages;
        grid.dataset.perPage = perPage;

        // BIND PAGINATION.
        var pagination = grid.querySelector('.lf-ytp__pagination');
        if (pagination) {
            bindPagination(grid, pagination, totalPages);
        }
    }

    // ----------------------------------------------------------------
    // BUILD CARD HTML
    // ----------------------------------------------------------------

    function buildCard(item, index, cardPage) {
        var snippet = item.snippet || {};
        var statistics = item.statistics || {};
        var videoId = (snippet.resourceId || {}).videoId || '';
        var titleRaw = snippet.title || '';
        var published = snippet.publishedAt || '';
        var thumbs = snippet.thumbnails || {};

        // BEST AVAILABLE THUMBNAIL.
        var thumbUrl = '';
        var sizes = ['maxres', 'standard', 'high', 'medium', 'default'];
        for (var i = 0; i < sizes.length; i++) {
            if (thumbs[sizes[i]] && thumbs[sizes[i]].url) {
                thumbUrl = thumbs[sizes[i]].url;
                break;
            }
        }

        // VIEW COUNT.
        var viewsLabel = '';
        if (statistics.viewCount !== undefined) {
            viewsLabel = parseInt(statistics.viewCount, 10).toLocaleString() + ' views';
        }

        var timeSince = published ? timeSinceDate(published) : '';
        var watchUrl = 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId);
        var embedUrl = 'https://www.youtube.com/embed/' + encodeURIComponent(videoId) + '?autoplay=1&rel=0';
        var hidden = cardPage > 0 ? ' lf-ytp__card--hidden' : '';
        var loading = index === 0 ? 'eager' : 'lazy';

        var thumbHtml = thumbUrl
            ? '<img class="lf-ytp__thumb" src="' + escAttr(thumbUrl) + '" alt="' + escAttr(titleRaw) + '" loading="' + loading + '" width="480" height="270" />'
            : '<div class="lf-ytp__thumb lf-ytp__thumb--placeholder"></div>';

        var html = '';
        html += '<article class="lf-ytp__card' + hidden + '" data-page="' + cardPage + '">';
        html += '<div class="lf-ytp__thumb-wrap">';
        html += thumbHtml;
        html += '<button class="lf-ytp__play-btn" aria-label="Play ' + escAttr(titleRaw) + '" data-embed-url="' + escAttr(embedUrl) + '" data-title="' + escAttr(titleRaw) + '">';
        html += '<svg class="lf-ytp__play-icon" viewBox="0 0 68 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';
        html += '<path class="lf-ytp__play-bg" d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"/>';
        html += '<path class="lf-ytp__play-arrow" d="M45 24 27 14v20z"/>';
        html += '</svg>';
        html += '</button>';
        html += '</div>';
        html += '<div class="lf-ytp__body">';
        html += '<h3 class="lf-ytp__title"><a href="' + escAttr(watchUrl) + '" target="_blank" rel="noopener noreferrer">' + escHtml(titleRaw) + '</a></h3>';
        html += '<div class="lf-ytp__meta">';
        if (viewsLabel) {
            html += '<span class="lf-ytp__meta-views">' + escHtml(viewsLabel) + '</span>';
        }
        if (timeSince) {
            html += '<time class="lf-ytp__meta-date" datetime="' + escAttr(published) + '">' + escHtml(timeSince) + '</time>';
        }
        html += '</div>';
        html += '</div>';
        html += '</article>';

        return html;
    }

    // ----------------------------------------------------------------
    // PAGINATION
    // ----------------------------------------------------------------

    function bindPagination(grid, pagination, totalPages) {
        pagination.addEventListener('click', function (e) {
            var link = e.target.closest('a.page-numbers');
            if (!link) return;
            e.preventDefault();
            var page = parseInt(link.dataset.page, 10);
            if (isNaN(page)) return;

            // SHOW/HIDE CARDS.
            var cards = grid.querySelectorAll('.lf-ytp__card');
            cards.forEach(function (card) {
                if (parseInt(card.dataset.page, 10) === page) {
                    card.classList.remove('lf-ytp__card--hidden');
                } else {
                    card.classList.add('lf-ytp__card--hidden');
                }
            });

            // REBUILD PAGINATION HTML.
            pagination.innerHTML = buildPaginationHtml(page, totalPages);

            // SCROLL WITH OFFSET.
            var offset = grid.getBoundingClientRect().top + window.pageYOffset - 250;
            window.scrollTo({ top: offset, behavior: 'smooth' });
        });
    }

    function buildPaginationHtml(current, total) {
        var html = '';

        // PREV.
        if (current > 0) {
            html += '<a class="prev page-numbers" href="#" data-page="' + (current - 1) + '">&larr; Prev</a>';
        }

        // PAGE NUMBERS WITH ELLIPSIS.
        for (var i = 0; i < total; i++) {
            var show = (i === 0 || i === total - 1 || Math.abs(i - current) <= 1);

            if (!show) {
                if (i === 1 && current > 3) {
                    html += '<span class="page-numbers dots">&hellip;</span>';
                } else if (i === total - 2 && current < total - 4) {
                    html += '<span class="page-numbers dots">&hellip;</span>';
                }
                continue;
            }

            if (i === current) {
                html += '<span aria-current="page" class="page-numbers current">' + (i + 1) + '</span>';
            } else {
                html += '<a class="page-numbers" href="#" data-page="' + i + '">' + (i + 1) + '</a>';
            }
        }

        // NEXT.
        if (current < total - 1) {
            html += '<a class="next page-numbers" href="#" data-page="' + (current + 1) + '">Next &rarr;</a>';
        }

        return html;
    }

    // ----------------------------------------------------------------
    // MODAL
    // ----------------------------------------------------------------

    function initModal() {
        var modal = document.getElementById('lf-ytp-modal');
        var iframe = modal ? modal.querySelector('.lf-ytp-modal__iframe') : null;
        var titleEl = modal ? modal.querySelector('.lf-ytp-modal__title') : null;
        var lastOpener = null;

        if (!modal) return;

        function openModal(embedUrl, title, opener) {
            lastOpener = opener || null;
            iframe.src = embedUrl;
            iframe.title = title || '';
            if (titleEl) titleEl.textContent = title || '';
            modal.removeAttribute('hidden');
            document.body.style.overflow = 'hidden';
            var closeBtn = modal.querySelector('.lf-ytp-modal__close');
            if (closeBtn) closeBtn.focus();
        }

        function closeModal() {
            modal.setAttribute('hidden', '');
            document.body.style.overflow = '';
            iframe.src = '';
            iframe.title = '';
            if (titleEl) titleEl.textContent = '';
            if (lastOpener) {
                lastOpener.focus();
                lastOpener = null;
            }
        }

        document.addEventListener('click', function (e) {
            var playBtn = e.target.closest('.lf-ytp__play-btn');
            if (playBtn) {
                e.preventDefault();
                openModal(playBtn.dataset.embedUrl || '', playBtn.dataset.title || '', playBtn);
                return;
            }
            if (e.target.closest('.lf-ytp-modal__close')) {
                closeModal();
                return;
            }
            if (e.target.closest('.lf-ytp-modal__backdrop')) {
                closeModal();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (modal.hasAttribute('hidden')) return;
            if (e.key === 'Escape' || e.key === 'Esc') {
                closeModal();
                return;
            }
            if (e.key === 'Tab') {
                var focusable = Array.from(modal.querySelectorAll(
                    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), iframe'
                ));
                var first = focusable[0];
                var last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });
    }

    // ----------------------------------------------------------------
    // LOCALSTORAGE CACHE
    // ----------------------------------------------------------------

    function getCache(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            var entry = JSON.parse(raw);
            if (Date.now() > entry.expires) {
                localStorage.removeItem(key);
                return null;
            }
            return entry.data;
        } catch (e) {
            return null;
        }
    }

    function setCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({
                expires: Date.now() + CACHE_TTL,
                data: data,
            }));
        } catch (e) {
            // LOCALSTORAGE UNAVAILABLE OR FULL — SILENTLY SKIP.
        }
    }

    // ----------------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------------

    function timeSinceDate(isoDate) {
        var diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
        var m = 60, h = m * 60, d = h * 24, w = d * 7, mo = d * 30, y = d * 365;
        if (diff < m) return 'Just now';
        if (diff < h) { var n = Math.floor(diff / m); return n + ' minute' + (n > 1 ? 's' : '') + ' ago'; }
        if (diff < d) { var n = Math.floor(diff / h); return n + ' hour' + (n > 1 ? 's' : '') + ' ago'; }
        if (diff < w) { var n = Math.floor(diff / d); return n + ' day' + (n > 1 ? 's' : '') + ' ago'; }
        if (diff < mo) { var n = Math.floor(diff / w); return n + ' week' + (n > 1 ? 's' : '') + ' ago'; }
        if (diff < y) { var n = Math.floor(diff / mo); return n + ' month' + (n > 1 ? 's' : '') + ' ago'; }
        var n = Math.floor(diff / y); return n + ' year' + (n > 1 ? 's' : '') + ' ago';
    }

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escAttr(str) { return escHtml(str); }

})();