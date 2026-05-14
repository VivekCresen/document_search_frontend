import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html'
})
export class Login {
  username = signal('');
  password = signal('');
  error    = signal('');

  constructor(private router: Router) {}

  login() {
    if (!this.username().trim() || !this.password().trim()) {
      this.error.set('Please enter username and password.');
      return;
    }
    const users: Record<string, string> = JSON.parse(localStorage.getItem('ds_users') ?? '{"admin":"admin"}');
    if (users[this.username()] === this.password()) {
      localStorage.setItem('ds_current_user', this.username());
      this.router.navigate(['/chat']);
    } else {
      this.error.set('Invalid username or password.');
    }
  }
}
