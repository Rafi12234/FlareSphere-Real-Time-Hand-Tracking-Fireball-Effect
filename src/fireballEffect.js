import { clamp, damp, damp2D, nowSeconds } from "./utils.js";

export class FireballEffect {
  constructor() {
    this.position = { x: 0.5, y: 0.5 };
    this.targetPosition = { x: 0.5, y: 0.5 };
    this.scale = 1;
    this.visibility = 0;
    this.active = false;
    this.time = nowSeconds();
    this.particles = [];
    this.maxParticles = 120;
    this.orbiters = this.createOrbiters(10);
    this.burstParticles = [];
    this.prevActive = false;
  }

  update(position, scale, active, deltaTime) {
    const dt = clamp(deltaTime, 1 / 240, 0.05);

    this.targetPosition = position ?? this.targetPosition;
    this.scale = damp(this.scale, scale ?? this.scale, 9.5, dt);
    this.active = Boolean(active);

    this.position = damp2D(this.position, this.targetPosition, 16, dt);

    // Visibility drives both bloom-in and shrink/fade-out transitions.
    this.visibility = damp(this.visibility, this.active ? 1 : 0, this.active ? 12 : 22, dt);

    this.time = nowSeconds();

    if (this.active && !this.prevActive) {
      this.spawnBurst("appear");
    }

    if (!this.active && this.prevActive) {
      this.spawnBurst("disappear");
    }
    this.prevActive = this.active;

    if (this.active && this.visibility > 0.2) {
      this.emitParticles(dt);
    }

    this.updateParticles(dt);
    this.updateOrbiters(dt);
    this.updateBurstParticles(dt);
  }

  createOrbiters(count) {
    return Array.from({ length: count }, (_, index) => ({
      angle: (Math.PI * 2 * index) / count,
      radius: 20 + Math.random() * 26,
      speed: 0.8 + Math.random() * 1.6,
      size: 1.8 + Math.random() * 2.8,
      drift: Math.random() * Math.PI * 2,
    }));
  }

  spawnBurst(type) {
    const count = type === "appear" ? 30 : 40;
    const baseSpeed = type === "appear" ? 150 : 220;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const spread = type === "appear" ? 0.7 : 1;
      const speed = baseSpeed * (0.35 + Math.random() * spread);
      const life = type === "appear" ? 0.26 + Math.random() * 0.24 : 0.2 + Math.random() * 0.22;

      this.burstParticles.push({
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: type === "appear" ? 1.6 + Math.random() * 2.4 : 1.2 + Math.random() * 2.2,
        kind: type,
      });
    }
  }

  emitParticles(deltaTime) {
    const spawnCount = Math.floor((28 + Math.random() * 26) * deltaTime);
    for (let i = 0; i < spawnCount; i += 1) {
      if (this.particles.length >= this.maxParticles) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 90;
      const life = 0.22 + Math.random() * 0.75;
      const drag = 1.8 + Math.random() * 2.4;
      const spin = (Math.random() - 0.5) * 3.2;

      this.particles.push({
        x: (Math.random() - 0.5) * 7,
        y: (Math.random() - 0.5) * 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin,
        drag,
        life,
        maxLife: life,
        size: 1.2 + Math.random() * 3.4,
        hueShift: Math.random(),
      });
    }
  }

  updateParticles(deltaTime) {
    this.particles = this.particles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * deltaTime,
        y: particle.y + particle.vy * deltaTime,
        vx: particle.vx * Math.exp(-particle.drag * deltaTime),
        vy: particle.vy * Math.exp(-particle.drag * deltaTime) - 22 * deltaTime,
        spin: particle.spin * Math.exp(-2 * deltaTime),
        life: particle.life - deltaTime,
      }))
      .filter((particle) => particle.life > 0);
  }

  updateOrbiters(deltaTime) {
    this.orbiters.forEach((orbiter) => {
      orbiter.angle += orbiter.speed * deltaTime;
      orbiter.drift += 0.9 * deltaTime;
    });
  }

  updateBurstParticles(deltaTime) {
    this.burstParticles = this.burstParticles
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx * deltaTime,
        y: particle.y + particle.vy * deltaTime,
        vx: particle.vx * Math.exp(-3.2 * deltaTime),
        vy: particle.vy * Math.exp(-3.2 * deltaTime),
        life: particle.life - deltaTime,
      }))
      .filter((particle) => particle.life > 0);
  }

  draw(ctx) {
    if (this.visibility <= 0.005 && this.burstParticles.length === 0) return;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const x = this.position.x * width;
    const y = this.position.y * height;

    const pulse = 1 + Math.sin(this.time * 8.7) * 0.08;
    const flicker = 0.94 + Math.random() * 0.13;
    const vanishSquash = 0.62 + this.visibility * 0.38;
    const radius = 56 * this.scale * pulse * flicker * vanishSquash;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    if (this.visibility > 0.005) {
      // Layered gradients create a cinematic energetic core + aura look.
      this.drawOuterGlow(ctx, x, y, radius * 2.4);
      this.drawHaloRing(ctx, x, y, radius * 1.32);
      this.drawCoreLayers(ctx, x, y, radius);
      this.drawOrbiters(ctx, x, y, radius);
      this.drawParticles(ctx, x, y, radius);
    }

    this.drawBurstParticles(ctx, x, y);

    ctx.restore();
  }

  drawOuterGlow(ctx, x, y, radius) {
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glowGradient.addColorStop(0, `rgba(255, 180, 65, ${0.2 * this.visibility})`);
    glowGradient.addColorStop(0.4, `rgba(255, 105, 30, ${0.12 * this.visibility})`);
    glowGradient.addColorStop(1, "rgba(255, 80, 20, 0)");

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHaloRing(ctx, x, y, radius) {
    const phase = this.time * 2.4;
    const wobble = Math.sin(phase) * radius * 0.07;
    const ringRadius = radius + wobble;

    ctx.lineWidth = Math.max(1.2, radius * 0.04);
    ctx.strokeStyle = `rgba(255, 212, 120, ${0.24 * this.visibility})`;
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawOrbiters(ctx, x, y, radius) {
    const orbiterVisibility = this.visibility * this.visibility;
    if (orbiterVisibility < 0.03) return;

    this.orbiters.forEach((orbiter) => {
      const orbitRadius = orbiter.radius * this.scale + Math.sin(orbiter.drift) * 6;
      const ox = x + Math.cos(orbiter.angle) * orbitRadius;
      const oy = y + Math.sin(orbiter.angle) * orbitRadius * 0.75;

      const glow = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbiter.size * 4.2);
      glow.addColorStop(0, `rgba(255, 224, 160, ${0.5 * orbiterVisibility})`);
      glow.addColorStop(1, "rgba(255, 158, 70, 0)");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(ox, oy, orbiter.size * 2.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 214, 130, ${0.7 * orbiterVisibility})`;
      ctx.beginPath();
      ctx.arc(ox, oy, orbiter.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawCoreLayers(ctx, x, y, radius) {
    const bloomRadius = radius * (0.9 + this.visibility * 0.45);

    const midGradient = ctx.createRadialGradient(x, y, radius * 0.12, x, y, bloomRadius);
    midGradient.addColorStop(0, `rgba(255, 245, 220, ${0.78 * this.visibility})`);
    midGradient.addColorStop(0.28, `rgba(255, 214, 82, ${0.75 * this.visibility})`);
    midGradient.addColorStop(0.58, `rgba(255, 118, 35, ${0.54 * this.visibility})`);
    midGradient.addColorStop(1, "rgba(255, 70, 25, 0)");

    ctx.fillStyle = midGradient;
    ctx.beginPath();
    ctx.arc(x, y, bloomRadius, 0, Math.PI * 2);
    ctx.fill();

    const innerRadius = radius * 0.36;
    const innerGradient = ctx.createRadialGradient(x, y, 0, x, y, innerRadius);
    innerGradient.addColorStop(0, `rgba(255, 255, 240, ${0.88 * this.visibility})`);
    innerGradient.addColorStop(1, `rgba(255, 205, 90, ${0.08 * this.visibility})`);

    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    const starRadius = innerRadius * 0.6;
    ctx.fillStyle = `rgba(255, 255, 250, ${0.32 * this.visibility})`;
    ctx.beginPath();
    ctx.moveTo(x - starRadius, y);
    ctx.lineTo(x, y - starRadius * 0.42);
    ctx.lineTo(x + starRadius, y);
    ctx.lineTo(x, y + starRadius * 0.42);
    ctx.closePath();
    ctx.fill();
  }

  drawParticles(ctx, originX, originY, radius) {
    this.particles.forEach((particle) => {
      const lifeAlpha = (particle.life / particle.maxLife) * this.visibility;
      const px = originX + particle.x;
      const py = originY + particle.y;
      const particleSize = particle.size * (0.5 + this.scale * 0.5);
      const warm = 180 + particle.hueShift * 60;
      const cool = 80 + particle.hueShift * 30;

      ctx.fillStyle = `rgba(255, ${warm}, ${cool}, ${lifeAlpha * 0.82})`;
      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 214, 140, ${lifeAlpha * 0.22})`;
      ctx.lineWidth = Math.max(0.6, particleSize * 0.4);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - particle.vx * 0.012, py - particle.vy * 0.012);
      ctx.stroke();
    });
  }

  drawBurstParticles(ctx, x, y) {
    this.burstParticles.forEach((particle) => {
      const alpha = particle.life / particle.maxLife;
      const px = x + particle.x;
      const py = y + particle.y;
      const color =
        particle.kind === "appear"
          ? `rgba(255, 236, 185, ${alpha * 0.85})`
          : `rgba(255, 170, 95, ${alpha * 0.82})`;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
