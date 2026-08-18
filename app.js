/**
 * Mamute Streamer v1.1.0
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
let statusDot, statusText, myPeerIdEl;
let remoteVideo, localVideo, localPreviewCard;
let placeholderOverlay, placeholderTitle, placeholderDesc, liveTag, playerInfoText;
let viewerCountEl, btnToggleShare, unmuteBanner;

function bindElements() {
    statusDot = document.getElementById('status-dot');
    statusText = document.getElementById('status-text');
    myPeerIdEl = document.getElementById('my-peer-id');

    remoteVideo = document.getElementById('remote-video');
    localVideo = document.getElementById('local-video');
    localPreviewCard = document.getElementById('local-preview-card');

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
        showToast('Erro ao carregar a biblioteca de sinalização PeerJS.', 'error');
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
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    {
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    }
                ]
            }
        });

        peer.on('open', (id) => {
            myId = id;
            if (myPeerIdEl) myPeerIdEl.innerText = id;
            if (statusDot) statusDot.className = 'status-dot online';
            if (statusText) statusText.innerText = 'Pronto para conectar';
            showToast('Conectado à rede P2P!', 'info');
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
            if (err.type === 'peer-unavailable') {
                showToast('O ID informado não está online ou foi digitado incorretamente.', 'error');
            } else {
                showToast('Erro de rede: ' + err.type, 'error');
            }
        });

        // Host: Handle incoming Data Connections from Viewers
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

        // Viewer / Host: Handle incoming Media Calls
        peer.on('call', (call) => {
            activeMediaCalls.add(call);

            if (isBroadcasting && localStream) {
                call.answer(localStream);
            } else {
                call.answer();
            }

            call.on('stream', (remoteStream) => {
                handleRemoteStream(remoteStream);
            });

            call.on('close', () => {
                resetPlayer('Transmissão Encerrada', 'O compartilhamento de tela foi encerrado.');
            });

            call.on('error', (err) => {
                console.error('Media call error:', err);
            });
        });

    } catch (err) {
        console.error('Failed to create PeerJS instance:', err);
        if (statusText) statusText.innerText = 'Erro de Inicialização';
        showToast('Erro de inicialização: ' + err.message, 'error');
    }
}

// Display remote video stream on the main stage
function handleRemoteStream(remoteStream) {
    if (!remoteVideo) return;

    // Enable all tracks in the stream
    remoteStream.getTracks().forEach(track => {
        track.enabled = true;
    });

    remoteVideo.srcObject = remoteStream;
    
    // Start muted to bypass browser Autoplay blocks (guarantees video frames render!)
    remoteVideo.muted = true;

    remoteVideo.play().then(() => {
        if (unmuteBanner) unmuteBanner.style.display = 'flex';
    }).catch(err => {
        console.warn('Autoplay blocked by browser policy:', err);
        if (unmuteBanner) unmuteBanner.style.display = 'flex';
    });

    if (statusText) statusText.innerText = 'Transmissão Ativa';
    if (statusDot) statusDot.className = 'status-dot online';
    if (placeholderOverlay) placeholderOverlay.style.display = 'none';
    if (liveTag) liveTag.classList.add('active');
    if (playerInfoText) playerInfoText.innerText = 'Assistindo transmissão em tempo real';
    showToast('Sinal de vídeo P2P recebido! Clique na tela para ativar o som.', 'success');
}

// Host: Toggle Screen Share
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
                showToast('Não foi possível acessar o microfone. Transmitindo apenas áudio do sistema.', 'warning');
            }
        }

        localStream = combinedStream;
        isBroadcasting = true;

        const videoTrack = screenStream.getVideoTracks()[0];
        videoTrack.onended = () => {
            stopScreenShare();
        };

        // Display local screen share in PIP preview box
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.play();
        }
        if (localPreviewCard) {
            localPreviewCard.style.display = 'flex';
        }

        if (btnToggleShare) {
            btnToggleShare.className = 'btn btn-danger';
            btnToggleShare.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Parar Transmissão';
        }

        showToast('Sua transmissão de tela foi iniciada!', 'success');

        // Automatically call all connected viewers with the new localStream
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

    if (localVideo) localVideo.srcObject = null;
    if (localPreviewCard) localPreviewCard.style.display = 'none';

    activeDataConnections.forEach(conn => {
        conn.send({ type: 'STATUS', isLive: false });
    });

    activeMediaCalls.forEach(call => call.close());
    activeMediaCalls.clear();

    if (btnToggleShare) {
        btnToggleShare.className = 'btn';
        btnToggleShare.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg> Iniciar Transmissão';
    }

    showToast('Sua transmissão foi encerrada.', 'info');
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

// Viewer: Connect to Host
function connectToHost() {
    const hostInput = document.getElementById('host-id-input');
    const hostId = hostInput ? hostInput.value.trim() : '';
    if (!hostId) {
        showToast('Por favor, digite ou cole o ID do Host.', 'warning');
        return;
    }

    if (hostId === myId) {
        showToast('Você não pode se conectar ao seu próprio ID.', 'warning');
        return;
    }

    if (!peer || peer.disconnected) {
        showToast('Reconectando ao servidor...', 'warning');
        if (peer) peer.reconnect();
        return;
    }

    if (statusText) statusText.innerText = 'Conectando ao Host...';
    showToast('Estabelecendo conexão P2P com ' + hostId.substring(0, 8) + '...', 'info');

    // 1. Establish Data Connection with Host
    const conn = peer.connect(hostId);

    conn.on('open', () => {
        showToast('Conectado ao Host! Solicitando vídeo...', 'success');
        if (statusText) statusText.innerText = 'Conectado ao Host (Aguardando Vídeo)';
        conn.send({ type: 'REQUEST_STREAM' });
    });

    conn.on('data', (data) => {
        if (data && data.type === 'STATUS') {
            if (!data.isLive) {
                resetPlayer('Host Online - Transmissão Desligada', 'O seu amigo está conectado, mas ainda não clicou no botão "Iniciar Transmissão". Peça a ele para clicar em "Iniciar Transmissão".');
                showToast('O Host está online, mas ainda não iniciou o compartilhamento de tela.', 'warning');
            }
        }
    });

    conn.on('close', () => {
        resetPlayer('Desconectado do Host', 'A conexão com o host foi encerrada.');
        showToast('Conexão encerrada.', 'warning');
    });

    conn.on('error', (err) => {
        console.error('Data connection error:', err);
        showToast('Erro ao conectar ao Host. Verifique se o ID está correto.', 'error');
    });
}

function resetPlayer(title, desc) {
    if (remoteVideo) remoteVideo.srcObject = null;
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
    showToast('ID copiado para a área de transferência!', 'success');
}

function copyShareLink() {
    if (!myId) {
        showToast('Aguarde o ID ser gerado...', 'warning');
        return;
    }
    const url = window.location.origin + window.location.pathname + '#' + myId;
    navigator.clipboard.writeText(url);
    showToast('Link de transmissão copiado!', 'success');
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

function toggleMute(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!remoteVideo) return;
    
    remoteVideo.muted = !remoteVideo.muted;
    if (!remoteVideo.muted) {
        remoteVideo.play();
        if (unmuteBanner) unmuteBanner.style.display = 'none';
        showToast('Áudio da transmissão ativado!', 'success');
    } else {
        showToast('Áudio mutado.', 'info');
    }
    updateVolumeIcon();
}

function unmuteStream(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!remoteVideo) return;
    
    remoteVideo.muted = false;
    remoteVideo.play().then(() => {
        if (unmuteBanner) unmuteBanner.style.display = 'none';
        showToast('Som e vídeo ativados!', 'success');
    }).catch(err => {
        console.error('Error unmuting:', err);
    });
    updateVolumeIcon();
}

function updateVolumeIcon() {
    const volIcon = document.getElementById('volume-icon');
    if (volIcon && remoteVideo) {
        if (remoteVideo.muted) {
            volIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
        } else {
            volIcon.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
        }
    }
}

function toggleFullscreen(e) {
    if (e && e.stopPropagation) e.stopPropagation();
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

    toast.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="' + iconColor + '" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>' + msg + '</span>';

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
