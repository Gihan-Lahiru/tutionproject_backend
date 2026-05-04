<?php

declare(strict_types=1);

header('Content-Type: application/json');

$stdin = stream_get_contents(STDIN);
if ($stdin === false || trim($stdin) === '') {
    fwrite(STDOUT, json_encode(['ok' => false, 'error' => 'Empty payload']) . PHP_EOL);
    exit(1);
}

$payload = json_decode($stdin, true);
if (!is_array($payload)) {
    fwrite(STDOUT, json_encode(['ok' => false, 'error' => 'Invalid JSON payload']) . PHP_EOL);
    exit(1);
}

$autoload = __DIR__ . '/../vendor/autoload.php';
if (!file_exists($autoload)) {
    fwrite(STDOUT, json_encode([
        'ok' => false,
        'error' => 'PHPMailer not installed. Run: composer require phpmailer/phpmailer'
    ]) . PHP_EOL);
    exit(1);
}

require_once $autoload;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

try {
    $mail = new PHPMailer(true);

    $transport = strtolower(trim((string)($payload['transport'] ?? 'smtp')));
    $username = trim((string)($payload['username'] ?? ''));

    if ($transport === 'mail') {
        // Use local PHP mail() transport (no SMTP credentials required).
        $mail->isMail();
    } else {
        $mail->isSMTP();
        $mail->Host = (string)($payload['host'] ?? 'smtp.gmail.com');
        $mail->Port = (int)($payload['port'] ?? 587);

        $secure = !empty($payload['secure']);
        if ($secure) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } else {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        }

        $password = trim((string)($payload['password'] ?? ''));
        if ($username === '' || $password === '') {
            throw new Exception('Missing SMTP username/password');
        }

        $mail->SMTPAuth = true;
        $mail->Username = $username;
        $mail->Password = $password;
    }
    $mail->CharSet = 'UTF-8';

    $fromEmail = trim((string)($payload['fromEmail'] ?? $username));
    $fromName = trim((string)($payload['fromName'] ?? 'Tuition Sir LMS'));
    $toEmail = trim((string)($payload['to'] ?? ''));
    $subject = (string)($payload['subject'] ?? '');
    $html = (string)($payload['html'] ?? '');

    if ($toEmail === '' || $subject === '' || $html === '') {
        throw new Exception('Missing required email fields');
    }

    if ($fromEmail === '') {
        throw new Exception('Missing sender email (fromEmail/EMAIL_USER)');
    }

    $mail->setFrom($fromEmail, $fromName);
    $mail->addAddress($toEmail);
    $mail->isHTML(true);
    $mail->Subject = $subject;
    $mail->Body = $html;

    $mail->send();

    fwrite(STDOUT, json_encode(['ok' => true]) . PHP_EOL);
    exit(0);
} catch (Exception $e) {
    fwrite(STDOUT, json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ]) . PHP_EOL);
    exit(1);
}
