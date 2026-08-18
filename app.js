/**
 * Mamute Streamer v1.0.0
 * WebRTC P2P Screen Sharing Application
 */

// Application State
let peer = null;
let myId = null;
let localStream = null;
let micStream = null;
let activeDataConnections = new Set();
let activeMediaCalls = new Set();
let isBroadcasting = false;

// DOM Elements
let statusDot, statusText, myPeerIdEl, mainVideo, placeholderOverlay;
let placeholderTitle, placeholderDesc, liveTag, playerInfoText;
let viewerCountEl, btnToggleShare, unmuteBanner;

function bindElements() {
    statusDot = document.getElementById('status-dot');
    statusText = document.getElementById('status-text');
    myPeerIdEl = document.getElementById('my-peer-id');
    mainVideo = document.getElementById('main-video');
    placeholderOverlay = document.getElementById('placeholder-overlay');
    placeholderTitle = document.getElementById('placeholder-title');
    placeholderDesc = document.getElementById('placeholder-desc');
    liveTag = document.getElementById('live-tag');
    playerInfoText = document.getElementById('player-info-text');
    viewerCountEl = document.getElementById('viewer-count');
    btnToggleShare = document.getElementById('btn-toggle-share');
    unmuteBanner = document.getElementById('unmute-banner');
}

function startApp() {
    bindElements();
    if (typeof Peer === 'undefined') {
        if (statusText) statusText.innerText = 'Erro ao carregar PeerJS (Verifique a internet)';
        showToast('Erro ao carregar a biblioteca de sinalizacao PeerJS.', 'error');
        return;
    }
    initPeer();
    checkUrlHash();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

function initPeer() {
    try {
        peer = new Peer({
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on('open', (id) => {
            myId = id;
            if (myPeerIdEl) myPeerIdEl.innerText = id;
            if (statusDot) statusDot.className = 'status-dot online';
            if (statusText) statusText.innerText = 'Pronto para conectar';
            showToast('Conectado a rede P2P!', 'info');
            checkUrlHash();
        });

        peer.on('disconnected', () => {
            if (statusDot) statusDot.className = 'status-dot offline';
            if (statusText) statusText.innerText = 'Desconectado (Reconectando...)';
            if (peer && !peer.destroyed) {
                peer.reconnect();
            }
        });

        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            if (statusDot) statusDot.className = 'status-dot offline';
            if (statusText) statusText.innerText = 'Erro de Rede (' + err.type + ')';
            showToast('Erro de rede: ' + err.type, 'error');
        });

        peer.on('connection', (conn) => {
            activeDataConnections.add(conn);
            updateViewerCount();

            conn.on('open', () => {
                conn.send({ type: 'STATUS', isLive: isBroadcasting });
                if (isBroadcasting && localStream) {
                    const mediaCall = peer.call(conn.peer, localStream);
                    activeMediaCalls.add(mediaCall);
                }
            });

            conn.on('data', (data) => {
                if (data && data.type === 'REQUEST_STREAM') {
                    if (isBroadcasting && localStream) {
                        const mediaCall = peer.call(conn.peer, localStream);
                        activeMediaCalls.add(mediaCall);
                    }
                }
            });

            conn.on('close', () => {
                activeDataConnections.delete(conn);
                updateViewerCount();
            });
        });

        peer.on('call', (call) => {
            if (isBroadcasting && localStream) {
                call.answer(localStream);
            } else {
                call.answer();
            }

            call.on('stream', (remoteStream) => {
                if (mainVideo) {
                    mainVideo.srcObject = remoteStream;
                    mainVideo.muted = false;

                    mainVideo.play().then(() => {
                        if (unmuteBanner) unmuteBanner.style.display = 'none';
                    }).catch(err => {
                        console.warn('Autoplay blocked by browser policy:', err);
                        if (unmuteBanner) unmuteBanner.style.display = 'flex';
                    });
                }

                if (placeholderOverlay) placeholderOverlay.style.display = 'none';
                if (liveTag) liveTag.classList.add('active');
                if (playerInfoText) playerInfoText.innerText = 'Assistindo transmissao em tempo real';
                showToast('Sinal de video recebido com sucesso!', 'success');
            });

            call.on('close', () => {
                resetPlayer('Transmissao Encerrada', 'O compartilhamento de tela foi encerrado.');
            });
        });

    } catch (err) {
        console.error('Failed to create PeerJS instance:', err);
        if (statusText) statusText.innerText = 'Erro de Inicializacao';
        showToast('Erro de inicializacao: ' + err.message, 'error');
    }
}

async function toggleScreenShare() {
    if (isBroadcasting) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
}

async function startScreenShare() {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', frameRate: { ideal: 60, max: 60 } },
            audio: true
        });

        let combinedStream = screenStream;

        const includeMicEl = document.getElementById('include-mic');
        const includeMic = includeMicEl ? includeMicEl.checked : false;
        if (includeMic) {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                combinedStream = mixAudioStreams(screenStream, micStream);
            } catch (micErr) {
                showToast('Nao foi possivel acessar o microfone. Transmitindo apenas audio do sistema.', 'warning');
            }
        }

        localStream = combinedStream;
        isBroadcasting = true;

        const videoTrack = screenStream.getVideoTracks()[0];
        videoTrack.onended = () => {
            stopScreenShare();
        };

        if (mainVideo) {
            mainVideo.srcObject = localStream;
            mainVideo.muted = true;
            mainVideo.play();
        }

        if (placeholderOverlay) placeholderOverlay.style.display = 'none';
        if (liveTag) liveTag.classList.add('active');
        if (playerInfoText) playerInfoText.innerText = 'Sua tela esta sendo transmitida';

        if (btnToggleShare) {
            btnToggleShare.className = 'btn btn-danger';
            btnToggleShare.innerHTML = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Parar Transmissao;
        }

        showToast('Transmissao de tela iniciada!', 'success');

        activeDataConnections.forEach(conn => {
            conn.send({ type: 'STATUS', isLive: true });
            const mediaCall = peer.call(conn.peer, localStream);
            activeMediaCalls.add(mediaCall);
        });

    } catch (err) {
        console.error('Error starting screen share:', err);
        if (err.name !== 'NotAllowedError') {
            showToast('Erro ao iniciar compartilhamento: ' + err.message, 'error');
        }
    }
}

function stopScreenShare() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    isBroadcasting = false;

    activeDataConnections.forEach(conn => {
        conn.send({ type: 'STATUS', isLive: false });
    });

    activeMediaCalls.forEach(call => call.close());
    activeMediaCalls.clear();

    if (btnToggleShare) {
        btnToggleShare.className = 'btn';
        btnToggleShare.innerHTML = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Iniciar Transmissao;
    }

    resetPlayer('Transmissao Parada', 'Voce encerrou a transmissao de tela.');
    showToast('Transmissao encerrada.', 'info');
}

function mixAudioStreams(screenStream, micStream) {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();

    if (screenStream.getAudioTracks().length > 0) {
        const screenSource = ctx.createMediaStreamSource(screenStream);
        screenSource.connect(dest);
    }

    if (micStream.getAudioTracks().length > 0) {
        const micSource = ctx.createMediaStreamSource(micStream);
        micSource.connect(dest);
    }

    const mixedAudioTrack = dest.stream.getAudioTracks()[0];
    const outputStream = new MediaStream([screenStream.getVideoTracks()[0]]);
    if (mixedAudioTrack) {
        outputStream.addTrack(mixedAudioTrack);
    }
    return outputStream;
}

function connectToHost() {
    const hostInput = document.getElementById('host-id-input');
    const hostId = hostInput ? hostInput.value.trim() : '';
    if (!hostId) {
        showToast('Por favor, digite ou cole o ID do Host.', 'warning');
        return;
    }

    if (hostId === myId) {
        showToast('Voce nao pode se conectar ao seu proprio ID.', 'warning');
        return;
    }

    if (!peer || peer.disconnected) {
        showToast('Reconectando ao servidor...', 'warning');
        if (peer) peer.reconnect();
        return;
    }

    if (statusText) statusText.innerText = 'Conectando ao host...';
    showToast('Solicitando transmissao de ' + hostId.substring(0, 8) + '...', 'info');

    const conn = peer.connect(hostId);

    conn.on('open', () => {
        showToast('Conectado ao Host! Solicitando video...', 'success');
        if (statusText) statusText.innerText = 'Conectado ao Host';
        conn.send({ type: 'REQUEST_STREAM' });
    });

    conn.on('data', (data) => {
        if (data && data.type === 'STATUS') {
            if (!data.isLive) {
                resetPlayer('Aguardando Transmissao', 'O host esta online, mas ainda nao iniciou o compartilhamento de tela.');
            }
        }
    });

    conn.on('close', () => {
        resetPlayer('Desconectado do Host', 'A conexao com o host foi encerrada.');
        showToast('Conexao encerrada.', 'warning');
    });

    conn.on('error', (err) => {
        console.error('Data connection error:', err);
        showToast('Erro ao conectar ao Host. Verifique se o ID esta correto.', 'error');
    });

    const mediaCall = peer.call(hostId, new MediaStream());

    mediaCall.on('stream', (remoteStream) => {
        if (mainVideo) {
            mainVideo.srcObject = remoteStream;
            mainVideo.muted = false;

            mainVideo.play().then(() => {
                if (unmuteBanner) unmuteBanner.style.display = 'none';
            }).catch(err => {
                console.warn('Autoplay blocked by browser policy:', err);
                if (unmuteBanner) unmuteBanner.style.display = 'flex';
            });
        }

        if (placeholderOverlay) placeholderOverlay.style.display = 'none';
        if (liveTag) liveTag.classList.add('active');
        if (playerInfoText) playerInfoText.innerText = 'Assistindo transmissao em tempo real';
        showToast('Transmissao de video conectada!', 'success');
    });

    mediaCall.on('error', (err) => {
        console.error('Media call error:', err);
    });
}

function resetPlayer(title, desc) {
    if (mainVideo) mainVideo.srcObject = null;
    if (placeholderTitle) placeholderTitle.innerText = title;
    if (placeholderDesc) placeholderDesc.innerText = desc;
    if (placeholderOverlay) placeholderOverlay.style.display = 'flex';
    if (liveTag) liveTag.classList.remove('active');
    if (playerInfoText) playerInfoText.innerText = 'Sem sinal';
    if (unmuteBanner) unmuteBanner.style.display = 'none';
}

function copyMyId() {
    if (!myId) {
        showToast('Aguarde o ID ser gerado...', 'warning');
        return;
    }
    navigator.clipboard.writeText(myId);
    showToast('ID copiado para a area de transferencia!', 'success');
}

function copyShareLink() {
    if (!myId) {
        showToast('Aguarde o ID ser gerado...', 'warning');
        return;
    }
    const url = window.location.origin + window.location.pathname + '#' + myId;
    navigator.clipboard.writeText(url);
    showToast('Link de transmissao copiado!', 'success');
}

function checkUrlHash() {
    const hash = window.location.hash.replace('#', '').trim();
    if (hash && hash.length > 5) {
        const hostInput = document.getElementById('host-id-input');
        if (hostInput) hostInput.value = hash;
        switchTab('viewer');
        showToast('ID do Host carregado pelo link da URL!', 'info');
    }
}

function toggleMute() {
    if (!mainVideo) return;
    mainVideo.muted = !mainVideo.muted;
    const volIcon = document.getElementById('volume-icon');
    if (volIcon) {
        if (mainVideo.muted) {
            volIcon.innerHTML = <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>;
        } else {
            volIcon.innerHTML = <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>;
        }
    }
}

function unmuteStream() {
    if (!mainVideo) return;
    mainVideo.muted = false;
    mainVideo.play().then(() => {
        if (unmuteBanner) unmuteBanner.style.display = 'none';
    });
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.querySelector('.stage-card').requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function switchTab(tab) {
    const btnHost = document.getElementById('tab-btn-host');
    const btnViewer = document.getElementById('tab-btn-viewer');
    const tabHost = document.getElementById('tab-host');
    const tabViewer = document.getElementById('tab-viewer');

    if (btnHost) btnHost.classList.toggle('active', tab === 'host');
    if (btnViewer) btnViewer.classList.toggle('active', tab === 'viewer');
    if (tabHost) tabHost.classList.toggle('active', tab === 'host');
    if (tabViewer) tabViewer.classList.toggle('active', tab === 'viewer');
}

function updateViewerCount() {
    if (viewerCountEl) viewerCountEl.innerText = activeDataConnections.size;
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';

    let iconColor = '#818cf8';
    if (type === 'success') iconColor = '#10b981';
    if (type === 'warning') iconColor = '#f59e0b';
    if (type === 'error') iconColor = '#ef4444';

    toast.innerHTML = 
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        <span></span>
    ;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
