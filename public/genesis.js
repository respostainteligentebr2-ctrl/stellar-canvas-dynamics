class FragmentationRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.mesh = null;
        this.elapsedTime = 0;
        this.lastFrameTime = 0;
        this.frameId = null;
        this.isRunning = false;
        this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.intensity = 0.5;
        this.animate = this.animate.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleMotionChange = this.handleMotionChange.bind(this);
    }

    init() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.pixelRatio = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.width, this.height);
        this.container.appendChild(this.renderer.domElement);

        const geometry = new THREE.IcosahedronGeometry(2, 64);
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uIntensity: { value: 0.5 },
                uColor: { value: new THREE.Color('#00f3ff') }
            },
            vertexShader: `
                varying vec2 vUv;
                varying float vNoise;
                uniform float uTime;
                uniform float uIntensity;

                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    vec3 i = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    vec4 x = x_ * ns.x + ns.yyyy;
                    vec4 y = y_ * ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);
                    vec4 s0 = floor(b0) * 2.0 + 1.0;
                    vec4 s1 = floor(b1) * 2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
                    vec3 p0 = vec3(a0.xy, h.x);
                    vec3 p1 = vec3(a0.zw, h.y);
                    vec3 p2 = vec3(a1.xy, h.z);
                    vec3 p3 = vec3(a1.zw, h.w);
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }

                void main() {
                    vUv = uv;
                    vNoise = snoise(vec3(position.xyz * 0.75 + uTime * 0.2));
                    vec3 newPos = position + normal * vNoise * uIntensity;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                varying float vNoise;
                uniform vec3 uColor;
                void main() {
                    float alpha = smoothstep(-0.5, 1.0, vNoise) * 0.5;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            wireframe: true
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        this.camera.position.z = 5;

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        this.motionQuery.addEventListener('change', this.handleMotionChange);

        if (this.motionQuery.matches) {
            this.renderer.render(this.scene, this.camera);
        } else {
            this.start();
        }
    }

    updateIntensity(val) {
        this.intensity = 0.5 + val;
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;

        this.width = width;
        this.height = height;
        if (pixelRatio !== this.pixelRatio) {
            this.pixelRatio = pixelRatio;
            this.renderer.setPixelRatio(pixelRatio);
        }
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    start() {
        if (this.isRunning || document.hidden || this.motionQuery.matches) return;
        this.isRunning = true;
        this.lastFrameTime = 0;
        this.frameId = requestAnimationFrame(this.animate);
    }

    stop() {
        this.isRunning = false;
        this.lastFrameTime = 0;
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.stop();
        } else {
            this.start();
        }
    }

    handleMotionChange(event) {
        if (event.matches) {
            this.stop();
            this.renderer.render(this.scene, this.camera);
        } else {
            this.start();
        }
    }

    animate(timestamp) {
        if (!this.isRunning) return;
        if (this.lastFrameTime) {
            this.elapsedTime += Math.min((timestamp - this.lastFrameTime) / 1000, 0.05);
        }
        this.lastFrameTime = timestamp;
        if (this.mesh) {
            this.mesh.material.uniforms.uTime.value = this.elapsedTime;
            this.mesh.material.uniforms.uIntensity.value = this.intensity;
            this.mesh.rotation.y = this.elapsedTime * 0.1;
        }
        this.renderer.render(this.scene, this.camera);
        this.frameId = requestAnimationFrame(this.animate);
    }
}

class AudioManager {
    constructor(src) {
        this.audio = new Audio(src || "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3");
        this.audio.loop = true;
        this.audio.volume = 0.3;
        this.isPlaying = false;
    }

    toggle() {
        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play().catch(e => console.warn("Audio interaction required first."));
        }
        this.isPlaying = !this.isPlaying;
        return this.isPlaying;
    }

    setVolume(val) {
        this.audio.volume = val;
    }
}

class SingulAIGenesis {
    constructor() {
        this.renderer = null;
        this.audio = null;
        this.init();
    }

    init() {
        this.initLucide();
        this.initNavigation();
        this.initCursor();
        this.initGSAP();
        this.initRenderer();
        this.initAudio();
        this.bindEvents();
    }

    initLucide() {
        lucide.createIcons();
    }

    initNavigation() {
        const header = document.getElementById('genesis-header');
        const navigation = document.getElementById('genesis-navigation');
        const toggle = document.getElementById('genesis-nav-toggle');
        const links = navigation?.querySelectorAll('.genesis-nav-links a');
        if (!header || !navigation || !toggle || !links) return;

        const setOpen = (open) => {
            navigation.classList.toggle('is-open', open);
            header.classList.toggle('menu-open', open);
            if (open) header.classList.remove('is-hidden');
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        };

        toggle.addEventListener('click', () => {
            setOpen(toggle.getAttribute('aria-expanded') !== 'true');
        });
        links.forEach((link) => link.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && navigation.classList.contains('is-open')) {
                setOpen(false);
                toggle.focus();
            }
        });
        document.addEventListener('click', (event) => {
            if (!navigation.contains(event.target)) setOpen(false);
        });

        let previousScrollY = window.scrollY;
        let scrollFrame = null;
        window.addEventListener('scroll', () => {
            if (scrollFrame !== null) return;
            scrollFrame = requestAnimationFrame(() => {
                scrollFrame = null;
                const currentScrollY = window.scrollY;
                if (navigation.classList.contains('is-open') || currentScrollY < 24 || currentScrollY < previousScrollY - 8) {
                    header.classList.remove('is-hidden');
                } else if (currentScrollY > previousScrollY + 8) {
                    header.classList.add('is-hidden');
                }

                const markerY = Math.min(window.innerHeight * 0.42, window.innerHeight - 1);
                const activeLink = [...links].find((link) => {
                    const target = link.dataset.sectionTarget;
                    const section = target && document.querySelector(target);
                    if (!section) return false;
                    const bounds = section.getBoundingClientRect();
                    return bounds.top <= markerY && bounds.bottom > markerY;
                });
                links.forEach((link) => {
                    if (link === activeLink) {
                        link.setAttribute('aria-current', 'location');
                    } else {
                        link.removeAttribute('aria-current');
                    }
                });
                previousScrollY = currentScrollY;
            });
        }, { passive: true });

        const accessButton = document.getElementById('singulai-fab');
        const footer = document.querySelector('footer');
        if (accessButton && footer && 'IntersectionObserver' in window) {
            const footerObserver = new IntersectionObserver(([entry]) => {
                accessButton.classList.toggle('is-footer-visible', entry.isIntersecting);
            }, { threshold: 0.01 });
            footerObserver.observe(footer);
        }
    }

    initCursor() {
        if (!window.matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches) return;
        
        const cursor = document.getElementById('custom-cursor');
        const follower = document.querySelector('.cursor-follower');
        if (!cursor || !follower) return;

        let targetX = 0;
        let targetY = 0;
        let followerX = 0;
        let followerY = 0;
        let pointerFrame = null;
        let hasPointer = false;

        const updatePointer = () => {
            pointerFrame = null;
            if (!hasPointer) return;

            followerX += (targetX - followerX) * 0.55;
            followerY += (targetY - followerY) * 0.55;
            cursor.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;
            follower.style.transform = `translate3d(${followerX}px, ${followerY}px, 0) translate(-50%, -50%)`;

            if (Math.abs(targetX - followerX) > 0.4 || Math.abs(targetY - followerY) > 0.4) {
                pointerFrame = requestAnimationFrame(updatePointer);
            }
        };

        window.addEventListener('pointermove', (event) => {
            targetX = event.clientX;
            targetY = event.clientY;
            if (!hasPointer) {
                followerX = targetX;
                followerY = targetY;
                hasPointer = true;
            }
            if (pointerFrame === null) pointerFrame = requestAnimationFrame(updatePointer);
        }, { passive: true });

        document.querySelectorAll('a, button, .group, .horizontal-item').forEach(el => {
            el.addEventListener('mouseenter', () => document.body.classList.add('cursor-active'));
            el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-active'));
        });
    }

    initRenderer() {
        this.renderer = new FragmentationRenderer('webgl-container');
        this.renderer.init();
    }

    initAudio() {
        this.audio = new AudioManager();
        const toggle = document.getElementById('audio-toggle');
        const statusText = document.getElementById('audio-status');
        const progress = document.getElementById('audio-progress');

        toggle.addEventListener('click', () => {
            const isPlaying = this.audio.toggle();
            statusText.textContent = isPlaying ? "Audio: On" : "Audio: Off";
            gsap.to(progress, { x: isPlaying ? '0%' : '-100%', duration: 0.5 });
        });
    }

    initGSAP() {
        gsap.registerPlugin(ScrollTrigger);

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            gsap.set('.hero-tag', { y: 0 });
            gsap.set('.hero-title', { opacity: 1, y: 0 });
            document.querySelector('.image-reveal-container')?.classList.add('revealed');
            return;
        }

        const heroTl = gsap.timeline();
        heroTl.to('.hero-tag', { y: 0, duration: 1, ease: 'expo.out' })
              .to('.hero-title', { opacity: 1, y: 0, duration: 1.5, ease: 'expo.out' }, '-=0.8');

        const horizontalSec = document.getElementById('horizontal-sec');
        const horizontalInner = document.querySelector('.horizontal-inner');
        
        if (horizontalSec && horizontalInner) {
            gsap.to(horizontalInner, {
                x: () => -(horizontalInner.scrollWidth - window.innerWidth),
                ease: 'none',
                scrollTrigger: {
                    trigger: horizontalSec,
                    pin: true,
                    scrub: 1,
                    end: () => '+=' + horizontalInner.scrollWidth,
                    onUpdate: (self) => {
                        if (this.renderer) this.renderer.updateIntensity(self.progress * 2);
                    }
                }
            });
        }

        ScrollTrigger.create({
            trigger: '#rupture',
            start: 'top 60%',
            onEnter: () => {
                const container = document.querySelector('.image-reveal-container');
                if (container) {
                    container.classList.add('revealed');
                }
            }
        });

        gsap.utils.toArray('.hero-title span').forEach(el => {
            gsap.to(el, {
                x: 100,
                scrollTrigger: {
                    trigger: '#origins',
                    start: 'top top',
                    end: 'bottom top',
                    scrub: true
                }
            });
        });
    }

    bindEvents() {
        let resizeFrame = null;
        window.addEventListener('resize', () => {
            if (resizeFrame !== null) return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = null;
                if (this.renderer) this.renderer.onResize();
            });
        }, { passive: true });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SingulAIGenesis();
});
