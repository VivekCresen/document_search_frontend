import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html'
})
export class Register {
  username = signal('');
  password = signal('');
  confirm  = signal('');
  error    = signal('');
  success  = signal('');

  constructor(private router: Router) {}

  register() {
    if (!this.username().trim() || !this.password().trim() || !this.confirm().trim()) {
      this.error.set('All fields are required.');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set('Passwords do not match.');
      return;
    }
    if (this.password().length < 4) {
      this.error.set('Password must be at least 4 characters.');
      return;
    }

    const users: Record<string, string> = JSON.parse(localStorage.getItem('ds_users') ?? '{"admin":"admin"}');
    if (users[this.username()]) {
      this.error.set('Username already exists.');
      return;
    }

    users[this.username()] = this.password();
    localStorage.setItem('ds_users', JSON.stringify(users));
    this.error.set('');
    this.success.set('Account created! Redirecting to login…');
    setTimeout(() => this.router.navigate(['/login']), 1500);
  }
}
