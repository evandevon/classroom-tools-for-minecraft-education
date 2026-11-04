import { Player, system, Vector3, world } from "@minecraft/server";
import { Polyfill, Vec3 } from "@bedrock-oss/bedrock-boost";
import { LockPlayerService } from "./lock_player.service.ts";

/** Keeps locked students inside their area: a push first, then a teleport. */
export class LockPlayerMechanic {
	private static readonly MAX_IMPULSE = 2;
	private static readonly IMPULSE_BUFFER_ZONE = 8;
	private static readonly SPHERE_POINTS_COUNT = 3000;
	private static readonly SPHERE_POINTS_RADIUS = 3;

	private activeBoundaryJobs: Map<string, number> = new Map();
	private tickCount = 0;

	constructor(private readonly service: LockPlayerService) {
		Polyfill.installPlayer();
	}

	initialize(): void {
		system.runInterval(() => this.tick(), 1);
	}

	tick(): void {
		const everySecond = this.tickCount++ % 20 === 0;
		if (everySecond) {
			const ended = this.service.getEntries().sweep();
			this.service.logEnded(ended.names, ended.everybody);
			if (ended.everybody) {
				this.service.students.notifyTeacher("§eLock time is up for everybody.");
			}
			if (ended.names.length) {
				this.service.students.notifyTeacher(
					`§eLock time is up: ${ended.names.join(", ")}`,
				);
			}
			this.service.forgetUnusedCentres();
		}
		if (this.service.getEntries().isEmpty()) return;

		for (const player of world.getAllPlayers()) {
			if (this.service.students.isStaff(player.id)) continue;
			// One student's error must never stop the others being handled.
			try {
				const entry = this.service.getEntries().effective(player.id);
				if (!entry) continue;
				const area = this.service.getActiveArea(player, entry.data);
				if (!area) continue;
				if (player.dimension.id !== area.dimensionId) {
					this.teleportBack(player, area.center, area.dimensionId);
					continue;
				}
				this.keepInside(player, area.center, area.radius, area.showBoundary, area.dimensionId);
			} catch (e) {
				console.warn(`Lock failed for ${player.name}: ${e}`);
			}
		}
	}

	private keepInside(
		player: Player,
		center: Vector3,
		radius: number,
		showBoundary: boolean,
		dimensionId: string,
	): void {
		const distance = Vec3.from(player.location).distance(center);
		const activation = Math.max(
			LockPlayerMechanic.SPHERE_POINTS_RADIUS,
			radius / 5,
		);
		if (showBoundary && radius - distance < activation) {
			this.displayBoundary(player, { center, radius });
		}
		if (distance <= radius) return;

		if (distance < radius + LockPlayerMechanic.IMPULSE_BUFFER_ZONE) {
			try {
				this.push(player, center);
				return;
			} catch (e) {
				console.warn(`Push failed for ${player.name}, teleporting: ${e}`);
			}
		}
		this.teleportBack(player, center, dimensionId);
	}

	private push(player: Player, center: Vector3): void {
		const cap = (v: number) =>
			Math.max(
				Math.min(v, LockPlayerMechanic.MAX_IMPULSE),
				-LockPlayerMechanic.MAX_IMPULSE,
			);
		player.applyImpulse({
			x: cap((center.x - player.location.x) * 0.1),
			y: 0.2,
			z: cap((center.z - player.location.z) * 0.1),
		});
		player.onScreenDisplay.setActionBar([
			{ translate: "edu_tools.actionbar.lock_player.too_far_push" },
		]);
	}

	private teleportBack(
		player: Player,
		center: Vector3,
		dimensionId: string,
	): void {
		player.teleport(center, {
			dimension: world.getDimension(dimensionId),
			rotation: player.getRotation(),
		});
		player.sendMessage({
			translate: "edu_tools.message.lock_player.too_far_teleport_center",
		});
		player.playSound("mob.endermen.portal");
	}

	displayBoundary(player: Player, lockSettings: { center: Vector3; radius: number }): void {
		if (!lockSettings) {
			return;
		}

		const playerId = player.id;

		// Check if there's already an active job for this player
		const existingJobId = this.activeBoundaryJobs.get(playerId);
		if (existingJobId !== undefined) {
			// Job is still running, no need to start a new one
			return;
		}

		const center = lockSettings.center;
		const radius = lockSettings.radius;

		// Calculate distance from player to boundary edge
		const playerDistance = Vec3.from(player.location).distance(center);
		const distanceFromEdge = radius - playerDistance;

		// Calculate dynamic sphere points count with radius scaling
		const dynamicPointsCount = this.calculateDynamicPointsCount(
			distanceFromEdge,
			radius,
		);

		const spherePoints = this.generateSpherePoints(
			center,
			radius,
			dynamicPointsCount,
			player.location,
			LockPlayerMechanic.SPHERE_POINTS_RADIUS,
		);

		if (spherePoints.length === 0) {
			return; // No points generated, nothing to display
		}

		// Start the boundary display job
		const jobId = system.runJob(
			this.boundaryDisplayGenerator(player, spherePoints),
		);
		this.activeBoundaryJobs.set(playerId, jobId);
	}

	/**
	 * Calculates the dynamic sphere points count based on distance from boundary edge.
	 * Returns 100% of SPHERE_POINTS_COUNT when player is at SPHERE_POINTS_RADIUS+1 blocks from edge,
	 * and reduces by 15% for each additional block of distance.
	 * Also applies radius-based scaling (SPHERE_POINTS_COUNT * radius/5).
	 * @param distanceFromEdge - The distance from the player to the boundary edge
	 * @param radius - The lock radius for scaling calculation
	 * @returns The calculated number of sphere points to generate
	 */
	private calculateDynamicPointsCount(
		distanceFromEdge: number,
		radius: number,
	): number {
		const thresholdDistance = LockPlayerMechanic.SPHERE_POINTS_RADIUS + 1;

		// Calculate base count with radius scaling
		const baseCount = Math.floor(
			LockPlayerMechanic.SPHERE_POINTS_COUNT * (radius / 5),
		);

		// If player is at or closer than threshold distance, use full count
		if (distanceFromEdge >= thresholdDistance) {
			return baseCount;
		}

		// Calculate how many blocks beyond threshold the player is
		const blocksOverThreshold = thresholdDistance - distanceFromEdge;

		// Apply 15% reduction per block (0.85 multiplier per block)
		const reductionFactor = Math.pow(0.85, blocksOverThreshold);

		// Calculate final count and ensure it's at least 1
		const dynamicCount = Math.max(
			1,
			Math.floor(baseCount * reductionFactor),
		);

		return dynamicCount;
	}

	/**
	 * Generator function that displays boundary particles with yielding between spawns
	 * @param player - The player to display boundaries for
	 * @param spherePoints - Array of points to display as particles
	 */
	private *boundaryDisplayGenerator(
		player: Player,
		spherePoints: Vector3[],
	): Generator<void, void, void> {
		const playerId = player.id;

		try {
			for (const point of spherePoints) {
				// Check if player still exists
				const currentPlayer = world.getEntity(playerId) as Player;
				if (!currentPlayer) {
					break; // Player no longer exists, stop generating
				}

				currentPlayer.dimension.spawnParticle(
					"minecraft:redstone_wire_dust_particle",
					point,
				);

				// Yield to allow other operations to run
				yield;
			}
		} finally {
			// Clean up the job tracking when generator completes or is interrupted
			this.activeBoundaryJobs.delete(playerId);
		}
	}

	/**
	 * Generates a list of points on the surface of a sphere that are within maxDistance from targetPosition.
	 * Uses optimized angular filtering to avoid generating unnecessary points.
	 * @param center The center of the sphere.
	 * @param radius The radius of the sphere.
	 * @param n The number of points to attempt to generate.
	 * @param targetPosition The position to filter points around.
	 * @param maxDistance Maximum distance from targetPosition.
	 */
	private generateSpherePoints(
		center: Vector3,
		radius: number,
		n: number,
		targetPosition: Vector3,
		maxDistance: number,
	): Vector3[] {
		const points: Vector3[] = [];

		// Calculate the direction from sphere center to target position
		const dirToTarget = {
			x: targetPosition.x - center.x,
			y: targetPosition.y - center.y,
			z: targetPosition.z - center.z,
		};

		const distToTarget = Math.sqrt(
			dirToTarget.x * dirToTarget.x +
				dirToTarget.y * dirToTarget.y +
				dirToTarget.z * dirToTarget.z,
		);

		// If target is at center, return all points
		if (distToTarget < 0.001) {
			return this.generateAllSpherePoints(center, radius, n);
		}

		// Normalize direction to target
		const normalizedDir = {
			x: dirToTarget.x / distToTarget,
			y: dirToTarget.y / distToTarget,
			z: dirToTarget.z / distToTarget,
		};

		// Calculate the maximum angular deviation (half-angle of cone)
		// Using law of cosines: cos(angle) = (radius² + distToTarget² - maxDistance²) / (2 * radius * distToTarget)
		const cosMaxAngle = Math.max(
			-1,
			Math.min(
				1,
				(radius * radius +
					distToTarget * distToTarget -
					maxDistance * maxDistance) /
					(2 * radius * distToTarget),
			),
		);
		const maxAngle = Math.acos(cosMaxAngle);

		const goldenRatio = (1 + Math.sqrt(5)) / 2;
		const angleIncrement = 2 * Math.PI * goldenRatio;

		for (let i = 0; i < n; i++) {
			const t = i / n;
			const inclination = Math.acos(1 - 2 * t);
			const azimuth = angleIncrement * i;

			// Calculate point on sphere
			const spherePoint = {
				x: Math.sin(inclination) * Math.cos(azimuth),
				y: Math.sin(inclination) * Math.sin(azimuth),
				z: Math.cos(inclination),
			};

			// Calculate angle between this point and target direction
			const dotProduct = spherePoint.x * normalizedDir.x +
				spherePoint.y * normalizedDir.y +
				spherePoint.z * normalizedDir.z;
			const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

			// Only include points within the angular cone
			if (angle <= maxAngle) {
				const worldPoint = {
					x: center.x + radius * spherePoint.x,
					y: center.y + radius * spherePoint.y,
					z: center.z + radius * spherePoint.z,
				};
				points.push(worldPoint);
			}
		}

		return points;
	}

	/**
	 * Generates all points on sphere (fallback for when target is at center)
	 */
	private generateAllSpherePoints(
		center: Vector3,
		radius: number,
		n: number,
	): Vector3[] {
		const points: Vector3[] = [];
		const goldenRatio = (1 + Math.sqrt(5)) / 2;
		const angleIncrement = 2 * Math.PI * goldenRatio;

		for (let i = 0; i < n; i++) {
			const t = i / n;
			const inclination = Math.acos(1 - 2 * t);
			const azimuth = angleIncrement * i;

			const x = center.x +
				radius * Math.sin(inclination) * Math.cos(azimuth);
			const y = center.y +
				radius * Math.sin(inclination) * Math.sin(azimuth);
			const z = center.z + radius * Math.cos(inclination);

			points.push({ x, y, z });
		}

		return points;
	}
}
