<script setup lang="ts">
import { ref } from 'vue';

// Public Web3Forms access key — safe to commit. Submissions are emailed to
// the address registered with this key (hi@andymai.com). Swap the key to
// reroute; no server code or secret lives in this repo.
const ACCESS_KEY = 'ec066be3-ba99-4b56-acff-e303421a972b';

type Status = 'idle' | 'sending' | 'ok' | 'error';

const status = ref<Status>('idle');
const errorMessage = ref('');

async function onSubmit(event: Event): Promise<void> {
  // Guard against a double-submit racing the disabled-button state.
  if (status.value === 'sending') return;

  const form = event.target as HTMLFormElement;
  // access_key and subject ride along as hidden inputs so the no-JS native
  // POST carries them too; FormData picks them up here without re-appending.
  const data = new FormData(form);

  status.value = 'sending';
  errorMessage.value = '';

  try {
    const res = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: data,
    });
    // A non-JSON error page (proxy/5xx) shouldn't masquerade as a network
    // error — fall back to an empty object and report the HTTP status.
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      message?: string;
    };
    if (json.success) {
      status.value = 'ok';
      form.reset();
    } else {
      status.value = 'error';
      errorMessage.value =
        json.message ?? `Couldn't send (error ${res.status}). Email hi@andymai.com instead.`;
    }
  } catch {
    status.value = 'error';
    errorMessage.value = 'Network error — email hi@andymai.com instead.';
  }
}
</script>

<template>
  <div class="contact-card">
    <div v-if="status === 'ok'" class="contact-success" role="status">
      <strong>Thanks — message received.</strong>
      <p>I read every inquiry myself and will get back to you at the email you gave.</p>
    </div>

    <!-- action/method make this a real POST to Web3Forms when JS is off;
         @submit.prevent intercepts and submits via fetch when JS is on. -->
    <form
      v-else
      class="contact-form"
      action="https://api.web3forms.com/submit"
      method="POST"
      @submit.prevent="onSubmit"
    >
      <input type="hidden" name="access_key" :value="ACCESS_KEY" />
      <input type="hidden" name="subject" value="brepjs — new message from the site" />
      <!-- Honeypot: real users never see or fill this. -->
      <input type="checkbox" name="botcheck" class="contact-hp" tabindex="-1" autocomplete="off" />

      <div class="contact-row">
        <label>
          <span>Name</span>
          <input type="text" name="name" autocomplete="name" required />
        </label>
        <label>
          <span>Company <em>(optional)</em></span>
          <input type="text" name="company" autocomplete="organization" />
        </label>
      </div>

      <label>
        <span>Email</span>
        <input type="email" name="email" autocomplete="email" required />
      </label>

      <label>
        <span>Message</span>
        <textarea
          name="message"
          rows="5"
          required
          placeholder="A project, a question, or just saying hi — whatever's on your mind."
        ></textarea>
      </label>

      <button type="submit" :disabled="status === 'sending'">
        {{ status === 'sending' ? 'Sending…' : 'Send' }}
      </button>

      <p v-if="status === 'error'" class="contact-error" role="alert">{{ errorMessage }}</p>
    </form>
  </div>
</template>

<style scoped>
.contact-card {
  margin-top: 1.5rem;
  padding: 1.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.contact-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 560px) {
  .contact-row {
    grid-template-columns: 1fr;
  }
}

.contact-form label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.contact-form label em {
  font-weight: 400;
  font-style: normal;
  color: var(--vp-c-text-3);
}

.contact-form input[type='text'],
.contact-form input[type='email'],
.contact-form textarea {
  width: 100%;
  padding: 0.6rem 0.75rem;
  font: inherit;
  font-weight: 400;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.contact-form textarea {
  resize: vertical;
}

.contact-form input:focus,
.contact-form textarea:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.contact-form button {
  align-self: flex-start;
  padding: 0.6rem 1.4rem;
  font-weight: 600;
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
  border-radius: 8px;
  transition:
    background 0.2s,
    opacity 0.2s;
}

.contact-form button:hover {
  background: var(--vp-c-brand-2);
}

.contact-form button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.contact-hp {
  position: absolute;
  left: -9999px;
}

.contact-success strong {
  font-size: 1.1rem;
}

.contact-success p {
  margin: 0.5rem 0 0;
  color: var(--vp-c-text-2);
}

.contact-error {
  margin: 0;
  color: var(--vp-c-danger-1, #e5484d);
  font-size: 0.875rem;
}
</style>
