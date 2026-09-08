CREATE TABLE `reservations` (
	`order_id` text PRIMARY KEY NOT NULL,
	`client_token` text NOT NULL,
	`sku` text NOT NULL,
	`inventory_code` text,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_client_token_unique` ON `reservations` (`client_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservations_inventory_code_unique` ON `reservations` (`inventory_code`);--> statement-breakpoint
ALTER TABLE `inventory_keys` ADD `reserved_order_id` text;--> statement-breakpoint
ALTER TABLE `inventory_keys` ADD `reserved_until` text;--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_keys_reserved_order_id_unique` ON `inventory_keys` (`reserved_order_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `unit_price` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `reservation_expires_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_at` text DEFAULT '1970-01-01T00:00:00.000Z' NOT NULL;