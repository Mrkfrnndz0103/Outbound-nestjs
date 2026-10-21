<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('user_events')) {
            return;
        }

        Schema::create('user_events', function (Blueprint $table): void {
            $table->id();
            $table->uuid('user_id');
            $table->uuid('actor_id')->nullable();
            $table->string('event_type');
            $table->text('metadata');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
            $table->index(['event_type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_events');
    }
};
