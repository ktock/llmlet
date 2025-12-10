mergeInto(LibraryManager.library, {
    send_peer__proxy: 'sync',
    send_peer__sig: 'iipi',
    send_peer: function(fd, ptr, len) {
        return Module.PeerManager.send(fd, HEAPU8.subarray(ptr, ptr + len));
    },

    $recv_peer_inner__proxy: 'sync',
    $recv_peer_inner__sig: 'vipip',
    $recv_peer_inner: function(fd, ptr, len, waitPtr) {
        var curptr = ptr;
        var writeCB = (res) => {
            HEAPU8.set(res, curptr);
            curptr += res.byteLength;
        }
        var doneCB = (ok) => {
            if (ok) {
                Atomics.store(HEAP32, waitPtr >> 2, curptr - ptr);
            } else {
                Atomics.store(HEAP32, waitPtr >> 2, -1);
            }
            Atomics.notify(HEAP32, waitPtr >> 2);
            return true;
        }
        Module.PeerManager.recv(fd, len, writeCB, doneCB);
        return;
    },

    $register_buf__proxy: 'sync',
    $register_buf__sig: 'ip',
    $register_buf: function(fd, ptr) {
        Module.PeerManager.register_buf(fd, ptr);
    },

    recv_peer__deps: ['$recv_peer_inner','malloc','free','$register_buf'],
    recv_peer__proxy: 'none',
    recv_peer__sig: 'iipi',
    recv_peer: function(fd, ptr, len) {
        const RECV_BUF_SIZE = 1000000;
        if (Module._connbuf == null) {
            Module._connbuf = {};
        }
        if (Module._connbuf[fd] == null) {
            var buf = _malloc(RECV_BUF_SIZE);
            Module._connbuf[fd] = {
                buf: buf,
                offset: 0,
                len: 0,
            }
            register_buf(fd, buf);
        }
        var connbuf = Module._connbuf[fd];
        if ((connbuf.len - connbuf.offset) > 0) {
            var copy_len = Math.min(len, connbuf.len - connbuf.offset)
            HEAP8.set(HEAP8.subarray(connbuf.buf + connbuf.offset, connbuf.buf + connbuf.offset + copy_len), ptr);
            Module._connbuf[fd].offset += copy_len;
            return copy_len;
        }
        Module._connbuf[fd].offset = 0;
        Module._connbuf[fd].len = 0;

        var waitPtr = _malloc(8);
        var isBufferTarget = false;
        var targetPtr = ptr;
        var targetLen = len;
        if (len < RECV_BUF_SIZE) {
            isBufferTarget = true;
            targetPtr = Module._connbuf[fd].buf;
            targetLen = RECV_BUF_SIZE;
        }
        Atomics.store(HEAP32, waitPtr >> 2, -2);
        recv_peer_inner(fd, targetPtr, targetLen, waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -2);
        var reslen = Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);

        if (isBufferTarget && (reslen > 0)) {
            Module._connbuf[fd].len = reslen;
            connbuf = Module._connbuf[fd];
            var copy_len = Math.min(len, connbuf.len - connbuf.offset)
            HEAP8.set(HEAP8.subarray(connbuf.buf + connbuf.offset, connbuf.buf + connbuf.offset + copy_len), ptr);
            Module._connbuf[fd].offset += copy_len;
            reslen = copy_len;
        }
        
        return reslen;
    },

    $connect_peer_inner__proxy: 'sync',
    $connect_peer_inner__sig: 'vpip',
    $connect_peer_inner: function(ptr, len, waitPtr) {
        var done = (res) => {
            Atomics.store(HEAP32, waitPtr >> 2, res);
            Atomics.notify(HEAP32, waitPtr >> 2);
        }
        var nodeid = new Uint8Array(HEAPU8.subarray(ptr, ptr + len));
        Module.PeerManager.connect((new TextDecoder('utf-8')).decode(nodeid), done);
        return;
    },

    connect_peer__deps: ['$connect_peer_inner', 'malloc', 'free'],
    connect_peer__proxy: 'none',
    connect_peer__sig: 'ipi',
    connect_peer: function(ptr, len) {
        var waitPtr = _malloc(8);
        Atomics.store(HEAP32, waitPtr >> 2, -2);
        connect_peer_inner(ptr, len, waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -2);
        var res = Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);
        return res;
    },

    $accept_peer_inner__proxy: 'sync',
    $accept_peer_inner__sig: 'vp',
    $accept_peer_inner: function(ptr) {
        Atomics.store(HEAP32, ptr >> 2, -1);
        Module.PeerManager.accept((fd) => {
            Atomics.store(HEAP32, ptr >> 2, fd);
            Atomics.notify(HEAP32, ptr >> 2);
        });
        return;
    },

    accept_peer__deps: ['$accept_peer_inner','malloc','free'],
    accept_peer__proxy: 'none',
    accept_peer__sig: 'i',
    accept_peer: function() {
        var waitPtr = _malloc(8);
        accept_peer_inner(waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -1);
        var fd = Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);
        return fd;
    },

    $release_conn__deps: ['free'],
    $release_conn: function(ptr) {
        _free(ptr);
    },
    
    $close_peer_inner__proxy: 'sync',
    $close_peer_inner__sig: 'i',
    $close_peer_inner: function(fd) {
        return Module.PeerManager.close_connection(fd);
    },

    close_peer__deps: ['$close_peer_inner','free','$release_conn'],
    close_peer__proxy: 'none',
    close_peer__sig: 'i',
    close_peer: function(fd) {
        return close_peer_inner(fd);
    },

    $get_next_prompt_inner__proxy: 'sync',
    $get_next_prompt_inner__sig: 'vpip',
    $get_next_prompt_inner: function(ptr, len, waitPtr) {
        Atomics.store(HEAP32, waitPtr >> 2, -1);
        Module.pending_prompt((p) => {
            var res = 0;
            if ((p != null) && (p.length != 0)) {
                res = (p.length < len) ? p.length : len;
                HEAPU8.set(p.slice(0, res).split('').map(c => c.charCodeAt(0)), ptr);
            }
            HEAPU8.set([0], ptr + res);
            Atomics.store(HEAP32, waitPtr >> 2, res);
            Atomics.notify(HEAP32, waitPtr >> 2);
        });
        return;
    },

    get_next_prompt__deps: ['$get_next_prompt_inner','malloc','free'],
    get_next_prompt__proxy: 'none',
    get_next_prompt__sig: 'ipi',
    get_next_prompt: function(ptr, len) {
        var waitPtr = _malloc(8);
        get_next_prompt_inner(ptr, len, waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -1);
        var res = Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);
        return res;
    },

    $get_system_prompt_inner__proxy: 'sync',
    $get_system_prompt_inner__sig: 'vpip',
    $get_system_prompt_inner: function(ptr, len, waitPtr) {
        Atomics.store(HEAP32, waitPtr >> 2, -1);
        Module.pending_system_prompt((p) => {
            var res = 0;
            if ((p != null) && (p.length != 0)) {
                res = (p.length < len) ? p.length : len;
                HEAPU8.set(p.slice(0, res).split('').map(c => c.charCodeAt(0)), ptr);
            }
            HEAPU8.set([0], ptr + res);
            Atomics.store(HEAP32, waitPtr >> 2, res);
            Atomics.notify(HEAP32, waitPtr >> 2);
        });
        return;
    },

    get_system_prompt__deps: ['$get_system_prompt_inner','malloc','free'],
    get_system_prompt__proxy: 'none',
    get_system_prompt__sig: 'ipi',
    get_system_prompt: function(ptr, len) {
        var waitPtr = _malloc(8);
        get_system_prompt_inner(ptr, len, waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -1);
        var res = Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);
        return res;
    },

    $cache_get_inner__proxy: 'sync',
    $cache_get_inner__sig: 'vpipiip',
    $cache_get_inner: function(keyptr, keylen, ptr, ofs, len, waitPtr) {
        var rawkey = (new TextDecoder('utf-8')).decode(new Uint8Array(HEAPU8.subarray(keyptr, keyptr + keylen)));
        Atomics.store(HEAP32, waitPtr >> 2, -1);

        const done = (res) => {
            if ((res != null) && (ofs < res.byteLength)) {
                var reslen = Math.min(len, res.byteLength - ofs);
                HEAPU8.set(res.subarray(ofs, ofs + reslen), ptr);
                Atomics.store(HEAP32, waitPtr >> 2, reslen);
                Atomics.notify(HEAP32, waitPtr >> 2);
            } else {
                Atomics.store(HEAP32, waitPtr >> 2, 0);
                Atomics.notify(HEAP32, waitPtr >> 2);
            }
        }
        const key = "rpcchunk:" + rawkey;
        Module.ChunkCache.get(key).then(data => {
            if (data != null) {
                done(new Uint8Array(data));
            } else {
                done(null);
            }
        }).catch(error => {
            console.error("error from rpcchunk cache: " + error);
        });
        return;
    },

    cache_get__deps: ['$cache_get_inner','malloc','free'],
    cache_get__proxy: 'none',
    cache_get__sig: 'ipipii',
    cache_get: function(keyptr, keylen, resptr, resofs, reslen) {
        var waitPtr = _malloc(8);
        cache_get_inner(keyptr, keylen, resptr, resofs, reslen, waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -1);
        var reslen = Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);
        return reslen;
    },

    $cache_put_inner__proxy: 'sync',
    $cache_put_inner__sig: 'vpipip',
    $cache_put_inner: function(keyptr, keylen, ptr, len, waitPtr) {
        var rawkey = (new TextDecoder('utf-8')).decode(new Uint8Array(HEAPU8.subarray(keyptr, keyptr + keylen)));
        Atomics.store(HEAP32, waitPtr >> 2, -1);

        const done = (res) => {
            Atomics.store(HEAP32, waitPtr >> 2, res ? 1 : 0);
            Atomics.notify(HEAP32, waitPtr >> 2);
        }
        const key = "rpcchunk:" + rawkey;
        Module.ChunkCache.put(key, HEAPU8.slice(ptr, ptr + len)).then(() => {
            console.log("cached data: " + key);
            done(true);
        }).catch(error => {
            console.log("failed to cache data " + key + ":" + error);
            done(false);
        });
        return;
    },

    cache_put__deps: ['$cache_put_inner','malloc','free'],
    cache_put__proxy: 'none',
    cache_put__sig: 'vpipi',
    cache_put: function(keyptr, keylen, resptr, reslen) {
        var waitPtr = _malloc(8);
        cache_put_inner(keyptr, keylen, resptr, reslen, waitPtr);
        Atomics.wait(HEAP32, waitPtr >> 2, -1);
        Atomics.load(HEAP32, waitPtr >> 2);
        _free(waitPtr);
        return;
    },

});
