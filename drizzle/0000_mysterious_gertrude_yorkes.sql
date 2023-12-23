CREATE TABLE `users` (
	`guild_id` text NOT NULL,
	`id` text NOT NULL,
	`ttl` integer NOT NULL,
	PRIMARY KEY(`guild_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`id` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`channel_id`, `guild_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `quering_idx` ON `messages` (`guild_id`,`expires_at`);