<?php

namespace App\Notifications;

use App\Models\Ticket;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TicketConfirmedNotification extends Notification
{
    use Queueable;

    public function __construct(public Ticket $ticket) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $departure = $this->ticket->trip?->departure_time
            ? $this->ticket->trip->departure_time->format('D, M j, Y @ g:i A').' WAT'
            : 'Scheduled Departure';

        $clientUrl = rtrim((string) (config('services.frontend_url') ?: config('app.url')), '/').'/client';

        return (new MailMessage)
            ->subject('TransitHub Ticket Confirmed - PNR: '.$this->ticket->pnr_code)
            ->greeting('Hello '.$this->ticket->passenger_name.',')
            ->line('Your journey has been confirmed. Below are your travel details:')
            ->line('**Booking Reference (PNR):** '.$this->ticket->pnr_code)
            ->line('**Route:** '.$this->ticket->route_name)
            ->line('**Departure Time:** '.$departure)
            ->line('**Seat Number:** Seat '.$this->ticket->seat_number)
            ->line('**Vehicle:** '.($this->ticket->vehicle_type ?: 'Coach').' ('.($this->ticket->trip?->bus?->reg_number ?: 'Assigned').')')
            ->line('**Fare Paid:** ₦'.number_format((float) $this->ticket->fare_paid, 2))
            ->line('**Emergency Contact:** '.$this->ticket->nok_name.' ('.$this->ticket->nok_phone.')')
            ->action('View & Download Boarding Pass', $clientUrl)
            ->line('Please present your digital QR code or printed boarding pass at the terminal gate 30 minutes before departure.')
            ->salutation('Safe Travels, TransitHub Team');
    }
}

