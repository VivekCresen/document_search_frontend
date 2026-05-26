import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html'
})
export class Register {
  userName = signal(''); // Ensure not pre-filled
  fullName = signal('');
  email    = signal(''); // Ensure not pre-filled
  password = signal(''); // Ensure not pre-filled
  confirm  = signal('');
  error    = signal('');
  success  = signal('');
  loading  = signal(false);

  constructor(private router: Router, private api: ApiService) {}

  register() {
    if (!this.userName().trim() || !this.fullName().trim() || !this.email().trim() || !this.password().trim() || !this.confirm().trim()) {
      this.error.set('All fields are required.');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set('Passwords do not match.');
      return;
    }
    if (this.password().length < 6) {
      this.error.set('Password must be at least 6 characters.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.register({ userName: this.userName(), fullName: this.fullName(), email: this.email(), password: this.password() }).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Account created! Redirecting to login…');
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.loading.set(false);
        console.error('Register error:', err);
        const msg = err.error?.message ?? err.error?.error ?? err.message ?? 'Registration failed. Please try again.';
        this.error.set(msg);
      }
    });
  }
}
