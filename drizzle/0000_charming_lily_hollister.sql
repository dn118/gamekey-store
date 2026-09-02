CREATE TABLE `delivery_attempts` (
	`request_id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`code` text,
	`reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_attempts_code_unique` ON `delivery_attempts` (`code`);--> statement-breakpoint
CREATE TABLE `inventory_keys` (
	`code` text PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`provider` text NOT NULL,
	`assigned_order_id` text,
	`assigned_request_id` text,
	`assigned_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_keys_assigned_order_id_unique` ON `inventory_keys` (`assigned_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_keys_assigned_request_id_unique` ON `inventory_keys` (`assigned_request_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`client_token` text NOT NULL,
	`sku` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`payment_status` text,
	`payment_event_at` text,
	`promo_code` text,
	`discount_amount` integer DEFAULT 0 NOT NULL,
	`delivery_request_id` text,
	`provider` text,
	`code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_client_token_unique` ON `orders` (`client_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_delivery_request_id_unique` ON `orders` (`delivery_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_unique` ON `orders` (`code`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`event_created_at` text NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text,
	`processing_result` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_events_event_id` ON `payment_events` (`event_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`sku` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`price` integer NOT NULL,
	`currency` text DEFAULT 'RUB' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`value` integer NOT NULL,
	`currency` text,
	`max_uses` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `promo_redemptions` (
	`client_token` text PRIMARY KEY NOT NULL,
	`promo_code` text NOT NULL,
	`discount_amount` integer NOT NULL,
	`order_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_redemptions_order_id_unique` ON `promo_redemptions` (`order_id`);--> statement-breakpoint
CREATE TABLE `provider_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`failure_rate` integer DEFAULT 0 NOT NULL,
	`timeout_rate` integer DEFAULT 0 NOT NULL,
	`delay_ms` integer DEFAULT 0 NOT NULL
);
