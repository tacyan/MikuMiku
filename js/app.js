/**
 * @file app.js
 * @description MMDモデル（miku.pmx）を読み込んでダンスさせるThree.jsアプリケーション
 * @version 1.2.0
 */

// スクリプトの二重読み込み防止チェック
if (window.APP_JS_LOADED) {
    console.log('app.jsは既に読み込まれています');
} else {
    // 初回読み込みのマーク
    window.APP_JS_LOADED = true;
    
    // デバッグモード - グローバル変数として定義し、ローカル参照として使用
    window.DEBUG = window.DEBUG || true;
    
    // 初期化用の変数
    let scene, camera, renderer, controls;
    let mesh, helper;
    let modelLoaded = false;
    let ammoReady = false;
    let ammoInitialized = false;
    let ammoInitializing = false;
    let physicsEnabled = true;
    let initStage = 0; // 初期化のステージを追跡
    let appStartTime = Date.now(); // アプリケーション開始時間
    
    // isInitializing変数の重複宣言を防止
    if (typeof window.isInitializing === 'undefined') {
        window.isInitializing = false; // グローバルに初期化中フラグを追加
    }
    
    // app.js内でisInitializingを使用するためのローカルエイリアス
    const getIsInitializing = () => window.isInitializing;
    const setIsInitializing = (value) => { window.isInitializing = !!value; };
    
    // THREEが未定義の場合に備えて即時に最小スタブを作成
    (function() {
        if (typeof THREE === 'undefined') {
            console.log('THREE未定義のため、最小スタブを即時作成します');
            window.THREE = {
                Clock: function() { 
                    this.getDelta = function() { return 0.016; };
                    this.start = function() {};
                }
            };
        }
    })();
    
    // THREE.Clockオブジェクトを安全に作成
    let clock = (typeof THREE !== 'undefined' && typeof THREE.Clock === 'function') ? 
        new THREE.Clock() : 
        {getDelta: function() { return 0.016; }};
    
    // デバッグ用ログ関数
    function debugLog(message) {
        if (window.DEBUG) {
            const timestamp = Math.floor((Date.now() - appStartTime) / 1000);
            console.log(`[DEBUG ${timestamp}s] ${message}`);
            const loadingText = document.getElementById('loading-text');
            if (loadingText) {
                loadingText.textContent = message;
            }
            // 新しいデバッグパネルにも情報を追加
            if (window.addDebugInfo) {
                window.addDebugInfo(message);
            }
        }
    }

    // 安全にTHREEオブジェクトを取得・作成する関数
    // 注意: recursiveFlag がtrueの場合は再帰呼び出しを防止
    function ensureThreeExists(recursiveFlag) {
        if (typeof THREE === 'undefined') {
            // 再帰呼び出し防止
            if (recursiveFlag) {
                console.log('警告: 再帰呼び出し検出。スタブ作成をスキップします');
                return false;
            }
            
            console.log('THREE未定義のため、スタブを作成します');
            window.THREE = window.THREE || {};
            // 必要最小限のメソッドを持つClockオブジェクト
            if (!window.THREE.Clock) {
                window.THREE.Clock = function() { 
                    this.getDelta = function() { return 0.016; };
                    this.start = function() {};
                };
            }
            return false;
        }
        return true;
    }

    // THREE未定義エラーに対応するための安全なTHREEアクセス
    function safeGetTHREE() {
        if (typeof THREE === 'undefined') {
            debugLog('THREEオブジェクトが未定義です。使用前に初期化する必要があります。');
            
            // 最小限のTHREEスタブを作成
            if (window.createThreeStub && typeof window.createThreeStub === 'function') {
                window.createThreeStub();
            } else {
                // index.htmlの関数が使えない場合の最小スタブ
                // 再帰呼び出し防止のため既存のTHREEオブジェクトをチェック
                if (!window.THREE) {
                    window.THREE = {
                        Scene: function() { this.background = { set: function() {} }; this.add = function() {}; },
                        PerspectiveCamera: function() { this.position = { set: function() {} }; },
                        WebGLRenderer: function() { 
                            this.setPixelRatio = function() {};
                            this.setSize = function() {};
                            this.shadowMap = { enabled: false };
                            this.render = function() {};
                            this.domElement = document.createElement('div');
                        },
                        GridHelper: function() {},
                        Color: function() {},
                        Clock: function() { this.getDelta = function() { return 0.016; } },
                        LoadingManager: function() {},
                        BoxGeometry: function() {},
                        MeshBasicMaterial: function() {},
                        Mesh: function() { this.position = { set: function() {} }; },
                        AmbientLight: function() {},
                        DirectionalLight: function() { this.position = { set: function() {} }; },
                        MMDLoader: function() { 
                            this.load = function(a,b) { if(typeof b === 'function') b({}); };
                        },
                        MMDAnimationHelper: function() { 
                            this.add = function() {};
                            this.remove = function() {};
                            this.update = function() {};
                        },
                        OrbitControls: function() {}
                    };
                    debugLog('アプリケーション内で最小限のTHREEスタブを作成しました');
                } else {
                    debugLog('既存のTHREEオブジェクトが見つかりました、スタブは作成しません');
                }
            }
        }
        return window.THREE;
    }

    // 安全にTHREEオブジェクトを作成する関数
    function safeCreateThreeObject(className, ...args) {
        const THREE = safeGetTHREE();
        if (!THREE || typeof THREE[className] !== 'function') {
            debugLog(`THREE.${className}が見つからないため、ダミーオブジェクトを返します`);
            return {}; // 空のダミーオブジェクト
        }
        try {
            return new THREE[className](...args);
        } catch (error) {
            debugLog(`THREE.${className}の作成に失敗: ${error.message}`);
            return {}; // エラー時も空のダミーオブジェクト
        }
    }

    // ステータス更新関数
    function updateStatus(message) {
        if (window.updateStatus) {
            window.updateStatus(message);
        }
    }

    // ステージ更新関数
    function updateStage(stage, max) {
        if (window.updateStage) {
            window.updateStage(stage, max);
        }
    }

    // ローディングテキスト更新
    function updateLoadingText(message) {
        if (window.updateLoadingText) {
            window.updateLoadingText(message);
        }
    }

    // Ammoステータス更新関数
    function updateAmmoStatus(state, message) {
        if (window.updateAmmoStatus) {
            window.updateAmmoStatus(state, message);
        }
    }

    // 物理エンジンの有効/無効を切り替える
    function setPhysicsEnabled(enabled) {
        physicsEnabled = enabled;
        debugLog(`物理演算: ${enabled ? '有効' : '無効'}`);
        
        // モーションが既に適用されている場合は再適用
        if (mesh && mesh.userData && mesh.userData.currentMotion && helper) {
            try {
                const currentMotion = mesh.userData.currentMotion;
                // 既存のモーションを削除
                helper.remove(mesh);
                // 新しい設定で再適用
                helper.add(mesh, {
                    animation: currentMotion,
                    physics: enabled && ammoReady
                });
            } catch (error) {
                debugLog(`モーション再適用中にエラー: ${error.message}`);
            }
        }
    }

    // グローバルに関数をエクスポート
    window.initAmmo = initAmmo;
    window.setPhysicsEnabled = setPhysicsEnabled;

    // エラーメッセージ表示関数
    function showError(message, details) {
        console.error(message);
        
        const loadingText = document.getElementById('loading-text');
        if (loadingText) {
            loadingText.textContent = `エラー: ${message}`;
            loadingText.style.color = 'red';
        }
        
        updateStatus(`エラー: ${message}`);
        
        // デバッグパネルにもエラーを追加
        if (window.addDebugInfo) {
            window.addDebugInfo(`エラー: ${message}`);
            if (details) {
                window.addDebugInfo(`詳細: ${details}`);
            }
        }
        
        // エラーメッセージをグローバルエラー表示関数に送信
        if (window.showErrorMessage) {
            window.showErrorMessage(message, details);
        }
    }

    // ローディングマネージャー作成関数
    function createLoadingManager() {
        // THREEが存在するか確認
        if (typeof THREE === 'undefined' || typeof THREE.LoadingManager !== 'function') {
            debugLog('THREE.LoadingManagerが見つからないため、ダミーオブジェクトを作成します');
            
            // ダミーのローディングマネージャーを返す
            return {
                onLoad: function(callback) { this.onLoadCallback = callback; },
                onProgress: function(callback) { this.onProgressCallback = callback; },
                onError: function(callback) { this.onErrorCallback = callback; },
                itemStart: function() {},
                itemEnd: function() {},
                itemError: function() {}
            };
        }
        
        try {
            // 正規のローディングマネージャーを作成
            const manager = new THREE.LoadingManager(
                // 読み込み完了時
                () => {
                    debugLog('読み込みが完了しました');
                    const loadingElem = document.getElementById('loading');
                    if (loadingElem) {
                        loadingElem.style.display = 'none';
                    }
                    modelLoaded = true;
                    updateStatus('モデル読み込み完了');
                },
                // 読み込み進捗時
                (url, itemsLoaded, itemsTotal) => {
                    const progress = Math.floor((itemsLoaded / itemsTotal) * 100);
                    const message = `モデルを読み込み中... ${progress}% (${url})`;
                    debugLog(message);
                    updateStatus(`読み込み中: ${progress}%`);
                },
                // エラー発生時
                (url) => {
                    showError(`ファイルの読み込みに失敗しました: ${url}`);
                }
            );
            return manager;
        } catch (error) {
            debugLog(`LoadingManager作成中にエラー: ${error.message}`);
            // エラー時はダミーを返す
            return {
                onLoad: function() {},
                onProgress: function() {},
                onError: function() {}
            };
        }
    }

    // 安全なローディングマネージャーの作成
    const loadingManager = createLoadingManager();

    // Ammo.jsの初期化を非同期で行う
    function initAmmo() {
        if (ammoInitialized || ammoInitializing) {
            return;
        }
        
        ammoInitializing = true;
        debugLog('Ammo.jsを非同期で初期化中...');
        updateStatus('物理エンジンを初期化中... (バックグラウンド)');
        updateAmmoStatus('initializing', '初期化中...');
        
        // タイムアウト設定（20秒後に諦める）
        const ammoTimeout = setTimeout(() => {
            if (!ammoReady) {
                debugLog('Ammo.jsの初期化がタイムアウトしました');
                updateStatus('物理エンジン初期化タイムアウト - 物理なしで続行');
                updateAmmoStatus('error', 'タイムアウト');
                ammoInitializing = false;
            }
        }, 20000);
        
        try {
            if (typeof Ammo === 'undefined') {
                showError('Ammo.jsが見つかりません。物理演算なしで続行します。');
                clearTimeout(ammoTimeout);
                ammoInitializing = false;
                updateAmmoStatus('error', '未検出');
                return;
            }
            
            Ammo().then(function(AmmoLib) {
                clearTimeout(ammoTimeout);
                debugLog('Ammo.js初期化完了');
                Ammo = AmmoLib;
                ammoReady = true;
                ammoInitialized = true;
                ammoInitializing = false;
                updateStatus('物理エンジン初期化完了');
                updateAmmoStatus('ready', '準備完了');
            }).catch(function(error) {
                clearTimeout(ammoTimeout);
                showError(`Ammo.jsの初期化に失敗しました: ${error}`);
                updateAmmoStatus('error', 'エラー');
                ammoInitializing = false;
            });
        } catch (error) {
            clearTimeout(ammoTimeout);
            showError(`Ammo.jsの読み込みに失敗しました: ${error}`);
            updateAmmoStatus('error', 'エラー');
            ammoInitializing = false;
        }
    }

    // ローディング画面を非表示にする関数（index.htmlのhideLoadingScreenと同等の機能）
    function hideLoadingScreen() {
        debugLog('app.jsからローディング画面を非表示にします');
        const loadingElem = document.getElementById('loading');
        if (loadingElem) {
            loadingElem.style.display = 'none';
            debugLog('ローディング画面を非表示にしました');
        }
        
        // 初期化完了フラグを設定
        window.appInitialized = true;
        
        if (window.APP_STATE) {
            window.APP_STATE.initCompleted = true;
        }
    }

    // 一定時間後に強制的にローディング画面を非表示にする
    setTimeout(() => {
        if (document.getElementById('loading') && 
            document.getElementById('loading').style.display !== 'none') {
            debugLog('10秒経過: app.jsからローディング画面を強制的に非表示にします');
            hideLoadingScreen();
        }
    }, 10000);

    // もう一つのバックアップタイマー - 3秒後にもチェック
    setTimeout(() => {
        // もし「初期化中...」の表示が残っていたら強制的に非表示
        const loadingTextElem = document.getElementById('loading-text');
        if (loadingTextElem && loadingTextElem.textContent === '初期化中...') {
            debugLog('3秒経過: 初期化中の表示が残っているので強制的に処理を続行します');
            // 初期化を強制的に完了とマーク
            window.appInitialized = true;
            if (window.APP_STATE) {
                window.APP_STATE.initCompleted = true;
                window.APP_STATE.isInitializing = false;
            }
            setIsInitializing(false);
            
            // ローディング画面を非表示
            hideLoadingScreen();
            
            // 初期化を再試行
            if (typeof init === 'function' && !scene) {
                debugLog('初期化を再試行します');
                try {
                    init();
                } catch (e) {
                    debugLog('再初期化中にエラー: ' + e.message);
                }
            }
        }
    }, 3000);

    /**
     * @function init
     * @description 3D環境の初期化とモデルの読み込みを行う
     */
    function init() {
        // 再帰呼び出しを防止
        if (getIsInitializing()) {
            debugLog('既に初期化中です。重複呼び出しを防止します。');
            return;
        }
        
        // 既に初期化されている場合はスキップ
        if (window.appInitialized) {
            debugLog('既に初期化されています。');
            
            // ただし、ローディング画面が表示されているなら非表示にする
            if (document.getElementById('loading') && 
                document.getElementById('loading').style.display !== 'none') {
                debugLog('初期化済みですが、ローディング画面が表示されているので非表示にします');
                hideLoadingScreen();
            }
            return;
        }
        
        // 初期化開始メッセージを表示
        const loadingTextElem = document.getElementById('loading-text');
        if (loadingTextElem) {
            loadingTextElem.textContent = '初期化中...';
        }
        
        // 初期化フラグを設定
        setIsInitializing(true);
        // APP_STATEとの同期
        if (window.APP_STATE) {
            window.APP_STATE.isInitializing = true;
        }
        
        debugLog('初期化を開始します...');
        initStage = 1;
        updateStage(1, 6);
        
        try {
            // THREEのオブジェクトの存在を確認
            if (!safeGetTHREE()) {
                showError('THREE.jsが見つかりません', 'ライブラリが正しく読み込まれていない可能性があります。');
                setIsInitializing(false);
                if (window.APP_STATE) {
                    window.APP_STATE.isInitializing = false;
                }
                hideLoadingScreen(); // エラー時もローディング画面を非表示に
                return;
            }
            
            // シーン初期化
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0xf0f0f0);
            
            initStage = 2;
            updateStage(2, 6);
            
            // カメラの設定（安全に）
            initStage = 3;
            debugLog('カメラを設定中...');
            updateStatus('3D環境を初期化中...(ステージ 3/6)');
            updateStage(3, 6);
            
            try {
                camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 2000);
                
                if (camera && camera.position) {
                    camera.position.set(0, 20, 40);
                }
            } catch (cameraError) {
                debugLog(`カメラ作成エラー: ${cameraError.message} - ダミーカメラを使用します`);
                camera = { 
                    position: { set: function() {} },
                    updateProjectionMatrix: function() {},
                    aspect: 1
                };
            }
            
            // レンダラーの初期化
            initStage = 4;
            debugLog('レンダラーを初期化中...');
            updateStatus('3D環境を初期化中...(ステージ 4/6)');
            updateStage(4, 6);
            
            try {
                renderer = new THREE.WebGLRenderer({ antialias: true });
                
                if (renderer) {
                    renderer.setPixelRatio(window.devicePixelRatio);
                    renderer.setSize(window.innerWidth, window.innerHeight);
                    
                    if (renderer.shadowMap) {
                        renderer.shadowMap.enabled = true;
                    }
                    
                    document.body.appendChild(renderer.domElement);
                }
            } catch (rendererError) {
                debugLog(`レンダラー作成エラー: ${rendererError.message} - ダミーレンダラーを使用します`);
                renderer = { 
                    setPixelRatio: function() {}, 
                    setSize: function() {}, 
                    render: function() {},
                    domElement: document.createElement('div')
                };
                document.body.appendChild(renderer.domElement);
            }
            
            // コントロールの設定
            initStage = 5;
            debugLog('コントロールを設定中...');
            updateStatus('3D環境を初期化中...(ステージ 5/6)');
            updateStage(5, 6);
            
            try {
                if (typeof THREE.OrbitControls === 'function') {
                    controls = new THREE.OrbitControls(camera, renderer.domElement);
                    
                    if (controls) {
                        controls.minDistance = 10;
                        controls.maxDistance = 100;
                    }
                } else {
                    debugLog('THREE.OrbitControlsが見つかりません。コントロールなしで続行します');
                }
            } catch (controlsError) {
                debugLog(`コントロール作成エラー: ${controlsError.message} - コントロールなしで続行します`);
            }
            
            // 光源の設定
            initStage = 6;
            debugLog('光源を設定中...');
            updateStatus('3D環境を初期化中...(ステージ 6/6)');
            updateStage(6, 6);
            
            try {
                if (typeof THREE.AmbientLight === 'function' && typeof THREE.DirectionalLight === 'function') {
                    // 環境光
                    const ambient = new THREE.AmbientLight(0x666666);
                    scene.add(ambient);
                    
                    // ディレクショナルライト
                    const directionalLight = new THREE.DirectionalLight(0x887766);
                    
                    if (directionalLight && directionalLight.position) {
                        directionalLight.position.set(-1, 1, 1).normalize();
                    }
                    
                    scene.add(directionalLight);
                }
            } catch (lightError) {
                debugLog(`光源作成エラー: ${lightError.message} - 光源なしで続行します`);
            }
            
            // グリッドとXYZ軸の追加（安全に）
            try {
                if (typeof THREE.GridHelper === 'function') {
                    const gridHelper = new THREE.GridHelper(100, 20);
                    scene.add(gridHelper);
                }
            } catch (gridError) {
                debugLog(`グリッド作成エラー: ${gridError.message} - グリッドなしで続行します`);
            }

            // MMDヘルパーの作成（安全に）
            try {
                if (typeof THREE.MMDAnimationHelper === 'function') {
                    helper = new THREE.MMDAnimationHelper({
                        afterglow: 2.0
                    });
                } else {
                    debugLog('THREE.MMDAnimationHelperが見つかりません。ダミーヘルパーを作成します');
                    helper = {
                        add: function() { return this; },
                        remove: function() { return this; },
                        update: function() { return this; }
                    };
                }
            } catch (helperError) {
                showError(`MMDAnimationHelperの初期化に失敗しました: ${helperError.message}`, 'モデル表示のみで続行します');
                helper = {
                    add: function() { return this; },
                    remove: function() { return this; },
                    update: function() { return this; }
                };
            }
            
            // ウィンドウのリサイズイベントを設定
            window.addEventListener('resize', onWindowResize, false);
            
            // ダンスボタンにイベントリスナーを追加
            const danceButton = document.getElementById('danceButton');
            if (danceButton) {
                danceButton.addEventListener('click', loadMotion);
            } else {
                debugLog('警告: ダンスボタン要素が見つかりません');
            }
            
            // アニメーションを開始（モデルが読み込まれていなくても、基本的なシーンを表示）
            animate();
            
            // 初期化完了をマーク
            window.appInitialized = true;
            if (window.APP_STATE) {
                window.APP_STATE.initCompleted = true;
            }
            
            // 初期化が成功したので、5秒後にローディング画面を強制的に非表示にする
            // （通常はモデル読み込み完了時に非表示になるが、フェイルセーフとして）
            setTimeout(() => {
                if (document.getElementById('loading') && 
                    document.getElementById('loading').style.display !== 'none') {
                    debugLog('初期化成功後5秒経過: ローディング画面を強制的に非表示にします');
                    hideLoadingScreen();
                }
            }, 5000);
            
            // モデルファイルの存在を確認
            checkModelFile();
            
            // エラーメッセージを消す
            const errorContainer = document.getElementById('error-container');
            if (errorContainer) {
                errorContainer.style.display = 'none';
            }
            
            // ローディングのテキストを更新
            if (loadingTextElem) {
                loadingTextElem.textContent = 'モデルをロード中...';
            }
            
            debugLog('初期化完了');
            updateStatus('初期化完了');
        } catch (error) {
            showError(`初期化中にエラーが発生しました: ${error.message}`, error.stack);
            // エラー発生時もローディング画面を非表示に
            setTimeout(hideLoadingScreen, 1000);
        } finally {
            // 初期化フラグをリセット
            setIsInitializing(false);
            if (window.APP_STATE) {
                window.APP_STATE.isInitializing = false;
            }
        }
    }

    /**
     * @function checkModelFile
     * @description モデルファイルの存在チェックとロード
     */
    function checkModelFile() {
        try {
            const modelPath = 'miku.pmx';
            debugLog(`モデルファイルの存在をチェック中: ${modelPath}`);
            
            // ファイルの存在チェック用のHTTPリクエスト
            const xhr = new XMLHttpRequest();
            xhr.open('HEAD', modelPath, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        debugLog(`モデルファイルが存在します: ${modelPath}`);
                        loadModel(modelPath);
                    } else {
                        showError(`モデルファイルが見つかりません: ${modelPath} (ステータス: ${xhr.status})`, 'モデルファイルを配置してください。');
                        updateStatus('モデルファイルが見つかりません');
                        // モデルが見つからない場合もローディング画面を非表示に
                        hideLoadingScreen();
                    }
                }
            };
            xhr.onerror = function() {
                debugLog(`モデルファイルチェック中にネットワークエラーが発生しました`);
                // エラー時もローディング画面を非表示に
                hideLoadingScreen();
            };
            xhr.timeout = 10000; // 10秒でタイムアウト
            xhr.ontimeout = function() {
                debugLog(`モデルファイルチェックがタイムアウトしました`);
                // タイムアウト時もローディング画面を非表示に
                hideLoadingScreen();
            };
            xhr.send(null);
        } catch (error) {
            showError(`モデルファイルチェック中にエラーが発生: ${error}`, 'ネットワークまたはファイルシステムへのアクセスに問題がある可能性があります。');
            // エラー時もローディング画面を非表示に
            hideLoadingScreen();
        }
    }

    /**
     * @function loadModel
     * @description モデルファイルをロードする
     * @param {string} modelPath - モデルファイルのパス
     */
    function loadModel(modelPath) {
        try {
            debugLog(`モデルをロード中: ${modelPath}`);
            updateStatus('モデルをロード中...');
            
            // THREEが利用可能か確認
            const THREE = safeGetTHREE();
            if (!THREE) {
                showError('THREE.jsライブラリが利用できません。モデルをロードできません。');
                return;
            }
            
            // MMDLoaderが利用可能かチェック
            if (typeof THREE.MMDLoader !== 'function') {
                debugLog('THREE.MMDLoaderが見つかりません。ダミーローダーを使用します。');
                
                // ダミーのMMDLoader作成
                THREE.MMDLoader = function(manager) {
                    this.load = function(path, onLoad, onProgress, onError) {
                        debugLog('ダミーMMDLoaderを使用: 簡易メッシュを返します');
                        
                        // 簡易的なメッシュを作成して返す
                        setTimeout(() => {
                            try {
                                const dummyMesh = {
                                    position: { set: function() {} },
                                    rotation: { x: 0, y: 0, z: 0 },
                                    scale: { set: function() {} },
                                    userData: {}
                                };
                                
                                if (typeof onLoad === 'function') {
                                    onLoad(dummyMesh);
                                }
                            } catch (error) {
                                if (typeof onError === 'function') {
                                    onError(error);
                                }
                            }
                        }, 1000);
                    };
                    
                    this.loadAnimation = function(path, mesh, onLoad, onProgress, onError) {
                        debugLog('ダミーMMDLoader.loadAnimationを使用: 空のモーションを返します');
                        
                        setTimeout(() => {
                            try {
                                const dummyMotion = {};
                                if (typeof onLoad === 'function') {
                                    onLoad(dummyMotion);
                                }
                            } catch (error) {
                                if (typeof onError === 'function') {
                                    onError(error);
                                }
                            }
                        }, 1000);
                    };
                };
                
                debugLog('ダミーMMDLoaderを作成しました');
            }
            
            // ローダーを作成（安全に）
            let mmdLoader;
            try {
                mmdLoader = new THREE.MMDLoader(loadingManager);
            } catch (loaderError) {
                showError(`MMDLoaderの作成に失敗しました: ${loaderError.message}`);
                return;
            }
            
            // モデルのロード
            try {
                mmdLoader.load(
                    modelPath,
                    (model) => {
                        debugLog('モデルのロードに成功しました');
                        updateStatus('モデルロード成功');
                        onModelLoaded(model);
                    },
                    (xhr) => {
                        if (xhr.lengthComputable) {
                            const progress = Math.floor((xhr.loaded / xhr.total) * 100);
                            debugLog(`モデル読み込み進捗: ${progress}%`);
                            updateStatus(`モデル読み込み中: ${progress}%`);
                        }
                    },
                    (error) => {
                        showError(`モデルの読み込みに失敗しました: ${error}`, 'モデルファイルが破損している可能性があります。');
                        console.error('モデル読み込みエラーの詳細:', error);
                    }
                );
            } catch (loadError) {
                showError(`モデルロード中に例外が発生: ${loadError.message}`);
            }
        } catch (error) {
            showError(`モデルローダーでエラーが発生: ${error}`, 'メモリ不足または不正なモデルファイルの可能性があります。');
            console.error('スタックトレース:', error.stack);
        }
    }

    /**
     * @function onModelLoaded
     * @description モデルが読み込まれた後の処理
     * @param {THREE.SkinnedMesh} mmd - 読み込まれたMMDモデル
     */
    function onModelLoaded(mmd) {
        // MMDLoaderで発生する可能性のある矛盾を回避するためのチェック
        if (!mmd) {
            debugLog('警告: モデルデータがnullまたはundefinedです');
            return;
        }
        
        debugLog('モデルが読み込まれました');
        
        // ローディング画面を非表示にする
        hideLoadingScreen();
        
        try {
            mesh = mmd;
        
            // モデルの初期位置を設定
            if (mesh && mesh.position) {
                mesh.position.set(0, 0, 0);
            }
        
            // シーンに追加
            scene.add(mesh);
        
            updateStatus('モデル読み込み完了');
        
            // 現在のモーション選択を保存
            const motionSelect = document.getElementById('motionSelect');
            let selectedMotion = 'idle';
            if (motionSelect && motionSelect.value) {
                selectedMotion = motionSelect.value;
            }
        
            // メッシュにモーション情報を保存
            if (mesh && mesh.userData) {
                mesh.userData.currentMotion = null;
            }
        
            modelLoaded = true;
        
            // モーションの読み込みをトリガー
            if (selectedMotion !== 'idle') {
                setTimeout(() => {
                    loadVmdMotion(`models/motions/${selectedMotion}.vmd`);
                }, 500);
            }
        } catch (error) {
            showError(`モデル適用中にエラーが発生しました: ${error.message}`, error.stack);
        }
    }

    /**
     * @function loadMotion
     * @description ダンスモーションを読み込む
     */
    function loadMotion() {
        if (!modelLoaded) {
            alert('モデルがまだ読み込まれていません。少々お待ちください。');
            return;
        }
        
        updateStatus('モーション準備中...');
        
        // テストモード選択時に物理エンジンが未初期化なら自動的に初期化を開始
        if (!ammoInitialized && !ammoInitializing && physicsEnabled) {
            initAmmo();
        }
        
        if (!ammoReady && physicsEnabled) {
            debugLog('物理演算エンジンなしでモーションを再生します');
        }

        const motionSelect = document.getElementById('motionSelect');
        if (!motionSelect) {
            showError('モーション選択要素が見つかりません');
            return;
        }
        
        const motionType = motionSelect.value;
        debugLog(`選択されたモーション: ${motionType}`);
        
        // テスト回転モードの場合
        if (motionType === 'test') {
            debugLog('テスト用の回転アニメーションを開始します');
            const loadingElem = document.getElementById('loading');
            if (loadingElem) {
                loadingElem.style.display = 'none';
            }
            
            if (mesh && mesh.userData) {
                mesh.userData.isTestMode = true;
                mesh.userData.currentMotion = null;
                
                // ヘルパーからモデルを削除（過去のモーションをクリア）
                if (helper) {
                    try {
                        helper.remove(mesh);
                    } catch (error) {
                        debugLog('ヘルパーからのモデル削除でエラー: ' + error.message);
                        // エラーを無視して続行
                    }
                }
            }
            
            updateStatus('テスト回転モード実行中');
            return;
        }
        
        // 通常のVMDモーション再生
        if (mesh && mesh.userData) {
            mesh.userData.isTestMode = false;
        }
        
        const loadingElem = document.getElementById('loading');
        const loadingTextElem = document.getElementById('loading-text');
        
        if (loadingElem) {
            loadingElem.style.display = 'flex';
        }
        
        if (loadingTextElem) {
            loadingTextElem.textContent = 'モーションを読み込み中...';
        }
        
        try {
            // VMDファイルの存在チェック
            const motionPath = 'motions/dance.vmd';
            
            const xhr = new XMLHttpRequest();
            xhr.open('HEAD', motionPath, true);
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        debugLog(`モーションファイルが存在します: ${motionPath}`);
                        loadVmdMotion(motionPath);
                    } else {
                        showError(`モーションファイルが見つかりません: ${motionPath} (ステータス: ${xhr.status})`, 'motionsフォルダにdance.vmdを配置してください。');
                        if (loadingElem) {
                            loadingElem.style.display = 'none';
                        }
                        updateStatus('モーションファイルが見つかりません');
                    }
                }
            };
            xhr.send(null);
        } catch (error) {
            showError(`モーションファイルチェック中にエラーが発生: ${error}`, 'ネットワークエラーの可能性があります。');
            if (loadingElem) {
                loadingElem.style.display = 'none';
            }
        }
    }

    /**
     * @function loadVmdMotion
     * @description VMDモーションファイルをロードして適用する
     * @param {string} motionPath - モーションファイルのパス
     */
    function loadVmdMotion(motionPath) {
        try {
            // THREEが利用可能か確認
            const THREE = safeGetTHREE();
            if (!THREE) {
                showError('THREE.jsライブラリが利用できません。モーションをロードできません。');
                const loadingElem = document.getElementById('loading');
                if (loadingElem) {
                    loadingElem.style.display = 'none';
                }
                return;
            }
            
            if (typeof THREE.MMDLoader !== 'function') {
                showError('THREE.MMDLoaderが見つかりません。ライブラリが正しく読み込まれているか確認してください。');
                const loadingElem = document.getElementById('loading');
                if (loadingElem) {
                    loadingElem.style.display = 'none';
                }
                return;
            }
            
            // ローダーを安全に作成
            let mmdLoader;
            try {
                mmdLoader = new THREE.MMDLoader(loadingManager);
            } catch (loaderError) {
                showError(`MMDLoaderの作成に失敗しました: ${loaderError.message}`);
                const loadingElem = document.getElementById('loading');
                if (loadingElem) {
                    loadingElem.style.display = 'none';
                }
                return;
            }
            
            try {
                mmdLoader.loadAnimation(
                    motionPath,
                    mesh,
                    (motion) => {
                        debugLog('モーションのロードに成功しました');
                        
                        // 現在のモーションを保存（安全に）
                        if (mesh && mesh.userData) {
                            mesh.userData.currentMotion = motion;
                        }
                        
                        // 既存のモーションがあれば削除（安全に）
                        try {
                            if (helper && typeof helper.remove === 'function' && mesh) {
                                helper.remove(mesh);
                            }
                        } catch (error) {
                            debugLog(`既存モーションの削除でエラー: ${error.message}`);
                            // エラーを無視して続行
                        }
                        
                        // モーションを適用（安全に）
                        try {
                            if (helper && typeof helper.add === 'function' && mesh) {
                                helper.add(mesh, {
                                    animation: motion,
                                    physics: physicsEnabled && ammoReady // 物理演算が有効かつAmmoが準備完了なら物理を使用
                                });
                            } else {
                                debugLog('MMDAnimationHelperが初期化されていないか無効なため、モーションを適用できません');
                            }
                        } catch (error) {
                            showError(`モーション適用中にエラーが発生: ${error.message}`);
                        }
                        
                        const loadingElem = document.getElementById('loading');
                        if (loadingElem) {
                            loadingElem.style.display = 'none';
                        }
                        
                        updateStatus('ダンス中' + (physicsEnabled && !ammoReady ? ' (物理なし)' : ''));
                        
                        if (physicsEnabled && !ammoReady) {
                            debugLog('物理エンジンがロードされていないため、物理計算なしでモーションを再生します');
                        }
                    },
                    (xhr) => {
                        if (xhr.lengthComputable) {
                            const progress = Math.floor((xhr.loaded / xhr.total) * 100);
                            debugLog(`モーション読み込み進捗: ${progress}%`);
                            const loadingTextElem = document.getElementById('loading-text');
                            if (loadingTextElem) {
                                loadingTextElem.textContent = `モーションを読み込み中... ${progress}%`;
                            }
                        }
                    },
                    (error) => {
                        showError(`モーションの読み込みに失敗しました: ${error}`);
                        const loadingElem = document.getElementById('loading');
                        if (loadingElem) {
                            loadingElem.style.display = 'none';
                        }
                    }
                );
            } catch (execError) {
                showError(`モーションの実行に失敗しました: ${execError.message}`);
                const loadingElem = document.getElementById('loading');
                if (loadingElem) {
                    loadingElem.style.display = 'none';
                }
            }
        } catch (error) {
            showError(`モーションのロード中にエラーが発生: ${error}`);
            const loadingElem = document.getElementById('loading');
            if (loadingElem) {
                loadingElem.style.display = 'none';
            }
        }
    }

    /**
     * @function animate
     * @description アニメーションループ
     */
    function animate() {
        try {
            // requestAnimationFrameはできるだけ例外を発生させたくないので、try-catchで囲む
            requestAnimationFrame(animate);
            
            // モデルが読み込まれている場合のみアニメーション処理
            if (modelLoaded && mesh) {
                // モデルのユーザーデータを安全に取得
                const userData = mesh.userData || {};
                
                if (userData.isTestMode) {
                    // テストモードの場合は単純に回転（安全に）
                    if (mesh.rotation) {
                        mesh.rotation.y = (mesh.rotation.y || 0) + 0.01;
                    }
                } else if (ammoReady && physicsEnabled && helper && typeof helper.update === 'function') {
                    // 通常のアニメーションと物理演算
                    try {
                        const delta = clock && typeof clock.getDelta === 'function' ? clock.getDelta() : 0.016;
                        helper.update(delta);
                    } catch (error) {
                        // エラーをログに記録するだけで続行
                        console.error('アニメーション更新エラー:', error);
                    }
                } else if (userData.currentMotion && helper && typeof helper.update === 'function') {
                    // 物理なしでのアニメーション
                    try {
                        const delta = clock && typeof clock.getDelta === 'function' ? clock.getDelta() : 0.016;
                        helper.update(delta);
                    } catch (error) {
                        // エラーをログに記録するだけで続行
                        console.error('アニメーション更新エラー:', error);
                    }
                }
            }
            
            // コントロール更新（安全に）
            if (controls && typeof controls.update === 'function') {
                try {
                    controls.update();
                } catch (error) {
                    // エラーを無視して続行
                    console.error('コントロール更新エラー:', error);
                }
            }
            
            // レンダリング（安全に）
            if (renderer && typeof renderer.render === 'function' && scene && camera) {
                try {
                    renderer.render(scene, camera);
                } catch (error) {
                    // エラーをログに記録するだけで続行
                    console.error('レンダリングエラー:', error);
                }
            }
        } catch (error) {
            // アニメーションループでのエラーをログに記録
            console.error('アニメーションループエラー:', error);
            
            // アニメーションループは継続するために、次のフレームを要求
            requestAnimationFrame(animate);
        }
    }

    /**
     * @function onWindowResize
     * @description ウィンドウサイズ変更時の処理
     */
    function onWindowResize() {
        try {
            if (camera) {
                // カメラのアスペクト比を更新（安全に）
                if (typeof camera.updateProjectionMatrix === 'function') {
                    camera.aspect = window.innerWidth / window.innerHeight;
                    camera.updateProjectionMatrix();
                }
            }
            
            if (renderer && typeof renderer.setSize === 'function') {
                // レンダラーのサイズを更新（安全に）
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
        } catch (error) {
            console.error('ウィンドウリサイズエラー:', error);
        }
    }

    // ウェブフォントの読み込みを監視（より良いUI表示のため）
    document.fonts.ready.then(function() {
        debugLog('ウェブフォントの読み込みが完了しました');
        
        // ウェブフォント読み込み完了後に強制的に初期化を実行
        // まだ初期化されていない場合にのみ実行
        if (!window.appInitialized && !getIsInitializing()) {
            debugLog('ウェブフォント読み込み後に初期化を実行します');
            setTimeout(function() {
                if (!window.appInitialized && !getIsInitializing()) {
                    init();
                }
            }, 500); // 少し遅延させて実行
        }
    }).catch(function(error) {
        debugLog(`ウェブフォント読み込みエラー: ${error.message}`);
        
        // エラーの場合も初期化を試みる
        if (!window.appInitialized && !getIsInitializing()) {
            debugLog('ウェブフォントエラー後も初期化を実行します');
            setTimeout(init, 500);
        }
    });

    // DOMContentLoaded時に初期化を試みる
    document.addEventListener('DOMContentLoaded', function() {
        debugLog('DOM読み込み完了、初期化を開始します');
        
        // 既に初期化済みでなければ初期化を実行
        if (!window.appInitialized && !getIsInitializing()) {
            setTimeout(init, 100);
        }
    });

    // 万が一の場合のバックアップ - ページ読み込み完了後にもチェック
    window.addEventListener('load', function() {
        debugLog('ページ読み込み完了、初期化状態をチェックします');
        
        // 3秒後に再度チェック
        setTimeout(function() {
            if (!window.appInitialized && !getIsInitializing()) {
                debugLog('初期化されていないため、強制的に初期化を実行します');
                init();
            } else if (document.getElementById('loading') && 
                       document.getElementById('loading').style.display !== 'none') {
                // 初期化済みでもまだローディング画面が表示されている場合は非表示に
                debugLog('初期化済みですが、ローディング画面が残っています。強制的に非表示にします');
                hideLoadingScreen();
            }
        }, 3000);
    });

    // さらなるバックアップとして、ページロード後8秒経っても初期化中なら強制的に進める
    setTimeout(function() {
        if (document.getElementById('loading') && 
            document.getElementById('loading').style.display !== 'none') {
            debugLog('8秒経過: ローディング画面が残っているため強制的に非表示にします');
            const loadingTextElem = document.getElementById('loading-text');
            if (loadingTextElem) {
                loadingTextElem.textContent = 'アプリケーションの準備が完了しました';
            }
            setTimeout(hideLoadingScreen, 500);
        }
    }, 8000);

    // 初期化関数も公開
    window.init = init;
    // ローディング画面を非表示にする関数も公開
    window.hideLoadingScreen = hideLoadingScreen;

    // 初期化状態を確認するデバッグ用関数
    console.log('app.js読み込み完了。init関数の状態:', typeof init === 'function' ? '定義済み' : '未定義');
    // index.htmlからの初期化を待機する（上記のイベントリスナーがバックアップ） 
}

// 緊急修復措置: ページロード後に実行
window.addEventListener('load', function() {
    // 5秒後に状態をチェック
    setTimeout(function() {
        // ローディング画面がまだ表示されているか確認
        const loadingElem = document.getElementById('loading');
        if (loadingElem && loadingElem.style.display !== 'none') {
            console.log('緊急措置: ローディング画面が5秒以上表示されているため、強制的に非表示にします');
            
            // ローディング画面を強制的に非表示
            loadingElem.style.display = 'none';
            
            // エラーメッセージを表示
            if (window.showErrorMessage) {
                window.showErrorMessage('初期化に時間がかかりすぎています', '一部の機能が動作しない可能性がありますが、アプリケーションを表示します');
            }
        }
    }, 5000);
}); 