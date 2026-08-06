import { z } from 'zod';

const RatingFields = {
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    volatility: z.number(),
    conservative_rating: z.number(),
    rating_low: z.number(),
    rating_high: z.number(),
    confidence: z.enum(['high', 'medium', 'low']),
    rated_matches: z.number().int(),
    rated_wins: z.number().int(),
    rated_losses: z.number().int(),
    win_rate: z.number(),
    provisional: z.boolean(),
    first_rated_at: z.string().nullable(),
    last_rated_at: z.string().nullable(),
};

export const RatingSchema = z.object({
    rank: z.number().int().nullable(),
    ...RatingFields,
});

export const RankedRatingSchema = z.object({
    rank: z.number().int(),
    ...RatingFields,
});

export const PredictionPlayerSchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    volatility: z.number(),
    provisional: z.boolean(),
    win_probability: z.number().min(0).max(1),
});
