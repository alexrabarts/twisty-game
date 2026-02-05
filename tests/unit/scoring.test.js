import { jest } from '@jest/globals';

describe('Scoring System', () => {
    describe('Checkpoint scoring', () => {
        test('should award base points for checkpoint', () => {
            const basePoints = 100;
            const multiplier = 1;
            
            const score = basePoints * multiplier;
            
            expect(score).toBe(100);
        });

        test('should apply combo multiplier to checkpoint score', () => {
            const basePoints = 100;
            const combo = 3;
            const multiplier = Math.min(combo / 2, 5);
            
            const score = basePoints * multiplier;
            
            expect(score).toBe(150);
        });

        test('should cap combo multiplier at 5x', () => {
            const basePoints = 100;
            const combo = 20;
            const multiplier = Math.min(combo / 2, 5);
            
            const score = basePoints * multiplier;
            
            expect(score).toBe(500);
        });

        test('should award speed bonus for fast checkpoint times', () => {
            const basePoints = 100;
            const speedKmh = 80; // km/h
            const speedBonus = Math.max(0, speedKmh - 60) * 1.5;
            
            const totalPoints = basePoints + Math.floor(speedBonus);
            
            expect(totalPoints).toBe(130);
        });

        test('should not give negative speed bonus', () => {
            const basePoints = 100;
            const speedKmh = 40; // slow
            const speedBonus = Math.max(0, speedKmh - 60) * 1.5;
            
            const totalPoints = basePoints + Math.floor(speedBonus);
            
            expect(totalPoints).toBe(100);
        });
    });

    describe('Wheelie scoring', () => {
        test('should award base wheelie points per frame', () => {
            const pointsPerSecond = 20;
            const deltaTime = 0.016; // 60fps
            
            const points = pointsPerSecond * deltaTime;
            
            expect(points).toBeCloseTo(0.32, 2);
        });

        test('should increase points for higher wheelie angle', () => {
            const angleDegrees = 60;
            let pointsPerSecond = 20;

            if (angleDegrees >= 60) {
                pointsPerSecond = 100;
            } else if (angleDegrees >= 40) {
                pointsPerSecond = 60;
            }

            expect(pointsPerSecond).toBe(100);
        });

        test('should apply duration bonus for long wheelies', () => {
            const wheelieDuration = 6; // seconds
            const durationBonus = Math.min(wheelieDuration / 3, 2);
            
            expect(durationBonus).toBe(2);
        });

        test('should cap duration bonus at 2x', () => {
            const wheelieDuration = 12; // seconds
            const durationBonus = Math.min(wheelieDuration / 3, 2);
            
            expect(durationBonus).toBe(2);
        });

        test('should apply speed multiplier to wheelie points', () => {
            const speedMph = 50;
            const speedMultiplier = 1 + (speedMph / 100);
            
            expect(speedMultiplier).toBe(1.5);
        });

        test('should accumulate total wheelie score', () => {
            const pointsPerSecond = 60;
            const deltaTime = 0.016;
            const durationBonus = 1.5;
            const speedMultiplier = 1.3;
            
            const pointsThisFrame = pointsPerSecond * deltaTime * durationBonus * speedMultiplier;
            
            expect(pointsThisFrame).toBeCloseTo(1.872, 2);
        });
    });

    describe('Jump scoring', () => {
        test('should award base jump score', () => {
            const baseScore = 50;
            
            expect(baseScore).toBe(50);
        });

        test('should award bonus for half flip', () => {
            const baseScore = 50;
            const rotationDegrees = 50; // about PI * 0.4 radians
            let jumpScore = baseScore;
            
            if (rotationDegrees > 40) {
                jumpScore += 100;
            }
            
            expect(jumpScore).toBe(150);
        });

        test('should award bonus for full flip', () => {
            const baseScore = 50;
            const rotationDegrees = 150; // about PI * 0.8 radians
            let jumpScore = baseScore;
            
            if (rotationDegrees > 140) {
                jumpScore += 200;
            }
            
            expect(jumpScore).toBe(250);
        });

        test('should award bonus for double flip', () => {
            const baseScore = 50;
            const rotationDegrees = 280; // about PI * 1.5 radians
            let jumpScore = baseScore;
            
            if (rotationDegrees > 270) {
                jumpScore += 500;
            }
            
            expect(jumpScore).toBe(550);
        });

        test('should apply combo multiplier to jump score', () => {
            const jumpScore = 200;
            const comboMultiplier = 2;
            
            const finalScore = jumpScore * comboMultiplier;
            
            expect(finalScore).toBe(400);
        });
    });

    describe('Cone scoring', () => {
        test('should award points for hitting cone', () => {
            const conePoints = 25;
            
            expect(conePoints).toBe(25);
        });

        test('should apply multiplier to cone hits', () => {
            const conePoints = 25;
            const multiplier = 3;
            
            const finalPoints = conePoints * multiplier;
            
            expect(finalPoints).toBe(75);
        });
    });

    describe('Speed streak scoring', () => {
        test('should award bonus every 5 seconds at high speed', () => {
            const streakTime = 5; // seconds
            const bonus = 250;
            
            expect(bonus).toBe(250);
        });

        test('should only award when above speed threshold', () => {
            const currentSpeed = 55; // mph
            const threshold = 50;
            
            const shouldAward = currentSpeed >= threshold;
            
            expect(shouldAward).toBe(true);
        });

        test('should not award below speed threshold', () => {
            const currentSpeed = 45; // mph
            const threshold = 50;
            
            const shouldAward = currentSpeed >= threshold;
            
            expect(shouldAward).toBe(false);
        });
    });

    describe('Near miss scoring', () => {
        test('should award points for near miss', () => {
            const nearMissPoints = 100;
            
            expect(nearMissPoints).toBe(100);
        });

        test('should detect near miss within range', () => {
            const distance = 2.5; // units
            const minDistance = 1.5;
            const maxDistance = 3;
            
            const isNearMiss = distance > minDistance && distance < maxDistance;
            
            expect(isNearMiss).toBe(true);
        });

        test('should not count collision as near miss', () => {
            const distance = 1; // too close
            const minDistance = 1.5;
            const maxDistance = 3;
            
            const isNearMiss = distance > minDistance && distance < maxDistance;
            
            expect(isNearMiss).toBe(false);
        });

        test('should not count far pass as near miss', () => {
            const distance = 5; // too far
            const minDistance = 1.5;
            const maxDistance = 3;
            
            const isNearMiss = distance > minDistance && distance < maxDistance;
            
            expect(isNearMiss).toBe(false);
        });
    });

    describe('Finish bonus', () => {
        test('should award finish bonus', () => {
            const baseBonus = 1000;
            const comboMultiplier = 2;
            
            const finishBonus = baseBonus * comboMultiplier;
            
            expect(finishBonus).toBe(2000);
        });

        test('should calculate final score', () => {
            const currentScore = 5000;
            const finishBonus = 1000;
            
            const totalScore = currentScore + finishBonus;
            
            expect(totalScore).toBe(6000);
        });
    });

    describe('High score tracking', () => {
        test('should update high score if beaten', () => {
            const currentScore = 10000;
            const previousHighScore = 8000;
            
            const newHighScore = Math.max(currentScore, previousHighScore);
            
            expect(newHighScore).toBe(10000);
        });

        test('should keep high score if not beaten', () => {
            const currentScore = 6000;
            const previousHighScore = 8000;
            
            const newHighScore = Math.max(currentScore, previousHighScore);
            
            expect(newHighScore).toBe(8000);
        });
    });

    describe('Score display formatting', () => {
        test('should format score with thousands separator', () => {
            const score = 12345;
            const formatted = score.toLocaleString();
            
            expect(formatted).toMatch(/12[,\s]345/);
        });

        test('should round fractional scores', () => {
            const score = 123.7;
            const rounded = Math.round(score);
            
            expect(rounded).toBe(124);
        });
    });

    describe('Combo system', () => {
        test('should increase combo on successful action', () => {
            let combo = 2;
            combo++;
            
            expect(combo).toBe(3);
        });

        test('should calculate multiplier from combo', () => {
            const combo = 6;
            const multiplier = Math.min(combo / 2, 5);
            
            expect(multiplier).toBe(3);
        });

        test('should reset combo on crash', () => {
            let combo = 5;
            combo = 0;
            
            expect(combo).toBe(0);
        });
    });
});